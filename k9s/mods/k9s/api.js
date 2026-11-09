import { requestRefusal, PROXY_HOST } from "./proxy-guard.js";
import { shortContext, firstLine, errorText } from "./kubectl.js";

export const TABLE_ACCEPT = "application/json;as=Table;v=v1;g=meta.k8s.io";
export const JSON_ACCEPT = "application/json";
export const TEXT_ACCEPT = "text/plain, */*";

const PAGE_LIMIT = "500";
const MAX_PAGES = 40;

const GROUPS = {
  pods: "/api/v1", services: "/api/v1", events: "/api/v1", nodes: "/api/v1", namespaces: "/api/v1",
  deployments: "/apis/apps/v1", statefulsets: "/apis/apps/v1", ingresses: "/apis/networking.k8s.io/v1",
};

export function collectionPath(resource, namespace) {
  const group = GROUPS[resource];
  if (!group) return null;
  return namespace ? `${group}/namespaces/${namespace}/${resource}` : `${group}/${resource}`;
}

export function objectPath(resource, namespace, name) {
  const collection = collectionPath(resource, namespace);
  return collection ? `${collection}/${name}` : null;
}

function queryString(query) {
  const pairs = Object.entries(query ?? {}).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

function statusBody(text) {
  try {
    const body = JSON.parse(text);
    return body?.kind === "Status" && body.message ? body : null;
  } catch {
    return null;
  }
}

export function statusError(status, text) {
  const body = statusBody(text);
  return body ? `Error from server (${body.reason || status}): ${body.message}` : `Error from server (${status}): ${firstLine(text) || "no body"}`;
}

async function fetchText(url, accept) {
  const response = await fetch(url, { method: "GET", headers: { Accept: accept } });
  return { status: response.status, ok: response.ok, text: await response.text() };
}

export async function apiGet(pool, cx, request) {
  const { context, path, query = {}, accept = JSON_ACCEPT, timeoutMs } = request;
  const port = pool.ready(context, cx);
  if (!port) return { fallback: true };
  await pool.ensureKnown();
  const refusal = requestRefusal({ method: "GET", context, path, query, port }, pool.known);
  if (refusal) return { ok: false, error: refusal };
  try {
    const timeout = cx.sleep(timeoutMs).then(() => ({ timedOut: true }));
    const got = await Promise.race([fetchText(`http://${PROXY_HOST}:${port}${path}${queryString(query)}`, accept), timeout]);
    if (got.timedOut) return { ok: false, error: `Unable to connect to ${shortContext(context)}: timed out after ${Math.round(timeoutMs / 1000)}s` };
    return got.ok ? { ok: true, text: got.text } : { ok: false, status: got.status, error: statusError(got.status, got.text) };
  } catch (error) {
    pool.markFailed(context, errorText(error));
    return { fallback: true };
  }
}

export async function apiJson(pool, cx, request) {
  const got = await apiGet(pool, cx, request);
  if (!got.ok) return got;
  try {
    return { ok: true, value: JSON.parse(got.text) };
  } catch (error) {
    return { ok: false, error: `Unreadable API answer: ${errorText(error)}` };
  }
}

export async function tablePages(pool, cx, request) {
  let tables = [];
  let token = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = { ...request.query, limit: PAGE_LIMIT, ...(token ? { continue: token } : {}) };
    const got = await apiJson(pool, cx, { ...request, query, accept: TABLE_ACCEPT });
    if (!got.ok) return got;
    if (got.value?.kind !== "Table") return { ok: false, error: "The API server did not answer with a table" };
    tables = [...tables, got.value];
    token = got.value.metadata?.continue ?? "";
    if (!token) break;
  }
  return { ok: true, tables };
}
