import { exec } from "herdr";

const ACLI = "acli";
const MAX_IN_FLIGHT = 6;
const CALL_TIMEOUT_MS = 35000;
const UNAUTHORIZED = /unauthori[sz]ed|auth login|not logged in|not authenticated/i;
const FAILED = /^\s*\u{2717}\s*Error:/u;
const SITE = /Site:\s*(\S+)/;

export const LOGIN_COMMAND = "acli jira auth login --web";
export const KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export function errorText(error) {
  return String(error?.message ?? error);
}

function acliError(result, what) {
  const text = (result.stderr || result.stdout || "").trim().replace(/^\u{2717}\s*/u, "").split("\n")[0];
  const error = new Error(text ? `${what}: ${text}` : `${what} exited ${result.code}`);
  return Object.assign(error, { auth: UNAUTHORIZED.test(text) });
}

let inFlight = 0;
let waiting = [];
let sleeper = null;

export function useSleep(sleep) {
  sleeper = sleep;
}

function acquire() {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => { waiting = [...waiting, resolve]; });
}

function release() {
  const [next, ...rest] = waiting;
  waiting = rest;
  if (next) next();
  else inFlight -= 1;
}

function timeout() {
  if (!sleeper) return new Promise(() => {});
  return sleeper(CALL_TIMEOUT_MS).then(() => ({ code: -1, stdout: "", stderr: `timed out after ${CALL_TIMEOUT_MS / 1000} s`}));
}

async function runLimited(args, what) {
  await acquire();
  try {
    const call = exec(ACLI, args).catch((e) => ({ code: -1, stdout: "", stderr: `cannot run ${ACLI}: ${errorText(e)}` }));
    return await Promise.race([call, timeout()]);
  } finally {
    release();
  }
}

export async function acli(args, what) {
  const result = await runLimited(args, what);
  const failed = result.code !== 0 || FAILED.test(result.stdout ?? "");
  if (failed) throw acliError({ ...result, code: result.code || 1, stderr: result.stderr || result.stdout }, what);
  return result.stdout ?? "";
}

export function parseJson(text, what) {
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error(`${what} printed no JSON`);
  try {
    return JSON.parse(text.slice(start));
  } catch (e) {
    throw new Error(`${what} printed invalid JSON: ${errorText(e)}`);
  }
}

export async function authStatus() {
  try {
    const out = await acli(["jira", "auth", "status"], "acli jira auth status");
    return Object.freeze({ ok: true, needsLogin: false, message: out.trim(), site: SITE.exec(out)?.[1] ?? null });
  } catch (e) {
    return Object.freeze({ ok: false, needsLogin: Boolean(e.auth) || /unauthori/i.test(errorText(e)), message: errorText(e), site: null });
  }
}

export function openUrl(url) {
  return exec("open", [url]);
}
