import { hc, terminals } from "herdr";
import { proxyArgv, proxyStartRefusal, PROXY_HOST, PROXY_FLAGS } from "./proxy-guard.js";
import { readContexts, shortContext, firstLine, errorText } from "./kubectl.js";

const LABEL = "k9s";
const LABEL_VALUE = "proxy";
const CONTEXT_LABEL = "k9s.context";
const PORT_LABEL = "k9s.port";
const FLAGS_LABEL = "k9s.flags";
const PORT_POLL_MS = 200;
const PORT_TRIES = 60;
const READ_MISSES = 5;
const LIVE_GRACE_MS = 5_000;
const WARM_TIMEOUT_MS = 20_000;
const BACKOFF_MS = [10_000, 30_000, 120_000, 300_000];
const SERVING = /Starting to serve on 127\.0\.0\.1:(\d{2,5})/;

export const PROXY_IDLE_MS = 10 * 60_000;

function flagsId(flags) {
  const hash = [...flags.join(" ")].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) >>> 0, 7);
  return hash.toString(36);
}

const FLAGS_ID = flagsId(PROXY_FLAGS);

function anyProxyTerminals() {
  return terminals().filter((one) => one.labels?.[LABEL] === LABEL_VALUE && one.state === "live");
}

function proxyTerminals() {
  return anyProxyTerminals().filter((one) => one.labels?.[FLAGS_LABEL] === FLAGS_ID);
}

function isLive(address) {
  return terminals().some((one) => one.address === address && one.state === "live");
}

function terminalName(context) {
  const slug = shortContext(context).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `k9s-proxy-${slug}`.slice(0, 32);
}

function killQuietly(address) {
  return hc(["kill", address]).catch(() => null);
}

function retireStale(context) {
  const stale = anyProxyTerminals().filter((one) => one.labels?.[CONTEXT_LABEL] === context && one.labels?.[FLAGS_LABEL] !== FLAGS_ID);
  return Promise.all(stale.map((one) => killQuietly(one.address)));
}

async function startTerminal(context) {
  const argv = proxyArgv(context);
  const refusal = proxyStartRefusal(argv);
  if (refusal) return { error: refusal };
  const labels = ["--label", `${LABEL}=${LABEL_VALUE}`, "--label", `${CONTEXT_LABEL}=${context}`, "--label", `${FLAGS_LABEL}=${FLAGS_ID}`];
  const ran = await hc(["run", "--json", "--bg", "--rm", "--no-parent", "--no-notify", "--name", terminalName(context), ...labels, "--", ...argv]);
  if (ran.code !== 0) return { error: `hc run failed: ${firstLine(ran.stderr) || `exit ${ran.code}`}` };
  try {
    const address = JSON.parse(ran.stdout).address;
    return address ? { address } : { error: "hc run answered without an address" };
  } catch (error) {
    return { error: `hc run answered oddly: ${errorText(error)}` };
  }
}

async function waitPort(address, cx) {
  let misses = 0;
  for (let attempt = 0; attempt < PORT_TRIES && misses < READ_MISSES; attempt += 1) {
    const read = await hc(["read", address, "--lines", "20"]).catch(() => ({ code: 1, stdout: "" }));
    const match = read.code === 0 ? SERVING.exec(read.stdout) : null;
    if (match) return { port: Number(match[1]) };
    misses = read.code === 0 ? 0 : misses + 1;
    await cx.sleep(PORT_POLL_MS);
  }
  return { error: misses >= READ_MISSES ? "kubectl proxy exited before serving" : "kubectl proxy did not start serving in time" };
}

async function warm(port, cx) {
  const request = fetch(`http://${PROXY_HOST}:${port}/version`, { method: "GET" }).then((response) => response.text());
  await Promise.race([request, cx.sleep(WARM_TIMEOUT_MS)]);
}

function adoptable(one) {
  const port = Number(one.labels?.[PORT_LABEL]);
  return { context: one.labels?.[CONTEXT_LABEL], address: one.address, port: Number.isInteger(port) && port > 0 ? port : null };
}

export class ProxyPool {
  constructor() {
    this.records = {};
    this.pending = {};
    this.known = new Set();
    this.isClosed = false;
  }

  setKnown(contexts) {
    this.known = new Set(contexts);
  }

  async ensureKnown() {
    if (this.known.size > 0) return;
    const listed = await readContexts();
    if (!listed.error) this.setKnown(listed.contexts);
  }

  adopt(now) {
    const found = proxyTerminals().map(adoptable).filter((one) => one.context && one.port && !this.records[one.context]?.port);
    const adopted = Object.fromEntries(found.map((one) => [one.context, { address: one.address, port: one.port, startedAt: now, lastUsed: now, failures: 0, retryAt: 0 }]));
    this.records = { ...this.records, ...adopted };
  }

  put(context, patch) {
    this.records = { ...this.records, [context]: { ...(this.records[context] ?? { failures: 0, retryAt: 0 }), ...patch } };
  }

  drop(context) {
    this.records = Object.fromEntries(Object.entries(this.records).filter(([key]) => key !== context));
  }

  liveRecord(context, now) {
    const record = this.records[context];
    if (!record?.port) return null;
    if (now - record.startedAt > LIVE_GRACE_MS && !isLive(record.address)) {
      this.drop(context);
      return null;
    }
    return record;
  }

  runningPort(context) {
    return this.liveRecord(context, Date.now())?.port ?? null;
  }

  mode(context) {
    return this.runningPort(context) ? "proxy" : "kubectl";
  }

  ready(context, cx) {
    const now = Date.now();
    const live = this.liveRecord(context, now);
    if (live) {
      this.put(context, { lastUsed: now });
      return live.port;
    }
    if ((this.records[context]?.retryAt ?? 0) > now || this.pending[context]) return null;
    this.pending = { ...this.pending, [context]: true };
    this.launch(context, cx).catch((error) => this.fail(context, null, errorText(error))).finally(() => {
      this.pending = Object.fromEntries(Object.entries(this.pending).filter(([key]) => key !== context));
    });
    return null;
  }

  async launch(context, cx) {
    await this.ensureKnown();
    if (!this.known.has(context)) return;
    await retireStale(context);
    const existing = proxyTerminals().map(adoptable).find((one) => one.context === context);
    const started = existing ? { address: existing.address } : await startTerminal(context);
    if (started.error) return this.fail(context, null, started.error);
    if (this.isClosed) return killQuietly(started.address);
    this.put(context, { address: started.address, port: null });
    const served = existing?.port ? { port: existing.port } : await waitPort(started.address, cx);
    if (served.error) return this.fail(context, started.address, served.error);
    if (!existing?.port) await hc(["label", started.address, `${PORT_LABEL}=${served.port}`]).catch(() => null);
    await warm(served.port, cx).catch(() => null);
    if (this.isClosed) return killQuietly(started.address);
    const now = Date.now();
    this.put(context, { address: started.address, port: served.port, startedAt: now, lastUsed: now, failures: 0, retryAt: 0, error: "" });
  }

  fail(context, address, error) {
    if (address) killQuietly(address);
    const failures = (this.records[context]?.failures ?? 0) + 1;
    const wait = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1];
    this.put(context, { address: null, port: null, failures, retryAt: Date.now() + wait, error });
  }

  markFailed(context, error) {
    const record = this.records[context];
    if (record?.address && !isLive(record.address)) {
      this.drop(context);
      return;
    }
    this.fail(context, record?.address ?? null, error);
  }

  reapIdle(now) {
    const idle = Object.entries(this.records).filter(([, record]) => record.port && now - record.lastUsed > PROXY_IDLE_MS);
    idle.forEach(([context, record]) => {
      killQuietly(record.address);
      this.drop(context);
    });
  }

  stopAll() {
    this.isClosed = true;
    const owned = Object.values(this.records).map((record) => record.address).filter(Boolean);
    const addresses = [...new Set([...owned, ...anyProxyTerminals().map((one) => one.address)])];
    this.records = {};
    return Promise.all(addresses.map(killQuietly));
  }
}
