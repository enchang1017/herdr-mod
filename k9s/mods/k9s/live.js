import { hc, terminals, openOverlay } from "herdr";
import { kubectl, readOnlyRefusal, selectorArgv, parseSelector, shortContext, firstLine, errorText } from "./kubectl.js";

const FOLLOW_TAIL_LINES = 50;
const FOLLOW_SINCE = "10m";
const FOLLOW_MAX_PODS = 20;
const RESUME_TAIL_LINES = 1000;
const FOLLOW_RETRIES = 10;
const BACKOFF_SECONDS = 2;
const BACKOFF_MAX_SECONDS = 30;
const HEALTHY_RUN_SECONDS = 30;
const LIVE_LABEL = "k9s";
const LIVE_LABEL_VALUE = "follow";
const BAR_HEIGHT = 32;

export const LIVE_WINDOW_KEY = "k9s-follow";

const FIRST_START = [`--tail=${FOLLOW_TAIL_LINES}`, `--since=${FOLLOW_SINCE}`];
const RESUME_START = [`--tail=${RESUME_TAIL_LINES}`];

const RECONNECT_SCRIPT = [
  "printf '\\033[2m[k9s] following:'; printf ' %s' \"$@\"; printf '\\033[0m\\n'",
  "first=1; misses=0; since=''",
  "while :; do",
  "  started=$(date +%s)",
  `  if [ "$first" = 1 ]; then "$@" ${FIRST_START.join(" ")}; else "$@" ${RESUME_START.join(" ")} --since-time="$since"; fi`,
  "  code=$?; first=0",
  "  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  `  if [ $(( $(date +%s) - started )) -ge ${HEALTHY_RUN_SECONDS} ]; then misses=1; else misses=$((misses + 1)); fi`,
  `  if [ "$misses" -gt ${FOLLOW_RETRIES} ]; then break; fi`,
  `  delay=$(( ${BACKOFF_SECONDS} * (1 << (misses - 1)) )); [ "$delay" -gt ${BACKOFF_MAX_SECONDS} ] && delay=${BACKOFF_MAX_SECONDS}`,
  `  printf '\\033[33m[k9s] stream ended (exit %s), reconnecting in %ss (%s/${FOLLOW_RETRIES})\\033[0m\\n' "$code" "$delay" "$misses"`,
  "  sleep \"$delay\"",
  "done",
  `printf '\\033[31m[k9s] gave up after ${FOLLOW_RETRIES} reconnects in a row. Enter closes.\\033[0m\\n'`,
  "read _",
].join("\n");

function streamFrom(source) {
  return source.pod
    ? [source.pod, "--all-containers"]
    : [`--selector=${source.selector}`, `--max-log-requests=${FOLLOW_MAX_PODS}`, "--ignore-errors"];
}

export function followArgv(source) {
  return ["kubectl", "logs", ...streamFrom(source), `--context=${source.context}`, `--namespace=${source.namespace}`, "--follow", "--prefix", "--timestamps"];
}

function followRefusal(base) {
  return readOnlyRefusal([...base, ...FIRST_START], { canFollow: true })
    ?? readOnlyRefusal([...base, ...RESUME_START, "--since-time=2000-01-01T00:00:00Z"], { canFollow: true });
}

async function resolveSource(live) {
  if (live.kind === "pod") return { context: live.context, namespace: live.namespace, pod: live.name };
  const ran = await kubectl(selectorArgv(live.context, live.namespace, live.kind, live.name));
  if (!ran.ok) return { error: `Cannot reach ${shortContext(live.context)}: ${firstLine(ran.error)}` };
  const selector = parseSelector(ran.stdout);
  return selector ? { context: live.context, namespace: live.namespace, selector } : { error: `${live.kind}/${live.name} has no label selector` };
}

export function liveTitle(live) {
  return `${shortContext(live.context)} ${live.namespace}/${live.name}`;
}

function labels(live) {
  const pairs = [[LIVE_LABEL, LIVE_LABEL_VALUE], ["k9s.context", live.context], ["k9s.namespace", live.namespace], ["k9s.kind", live.kind], ["k9s.name", live.name]];
  return pairs.flatMap(([key, value]) => ["--label", `${key}=${value}`]);
}

async function startTerminal(live, source) {
  const base = followArgv(source);
  const refusal = followRefusal(base);
  if (refusal) return { error: refusal };
  const args = ["run", "--json", "--bg", "--keep", "--no-parent", ...labels(live), "--", "sh", "-c", RECONNECT_SCRIPT, "k9s-follow", ...base];
  const ran = await hc(args);
  if (ran.code !== 0) return { error: `hc run failed: ${firstLine(ran.stderr) || `exit ${ran.code}`}` };
  try {
    const address = JSON.parse(ran.stdout).address;
    return address ? { address } : { error: "hc run answered without an address" };
  } catch (error) {
    return { error: `hc run answered oddly: ${errorText(error)}` };
  }
}

export function liveTerminals() {
  return terminals().filter((one) => one.labels?.[LIVE_LABEL] === LIVE_LABEL_VALUE && one.state === "live");
}

export function liveOf(terminal) {
  const l = terminal.labels ?? {};
  return { address: terminal.address, context: l["k9s.context"], namespace: l["k9s.namespace"], kind: l["k9s.kind"], name: l["k9s.name"] };
}

export async function killTerminal(address) {
  const ran = await hc(["kill", address]);
  return ran.code === 0 ? "" : `could not stop ${address}: ${firstLine(ran.stderr) || `exit ${ran.code}`}`;
}

export async function stopAll() {
  const results = await Promise.all(liveTerminals().map((one) => killTerminal(one.address)));
  return results.filter(Boolean).join("; ");
}

export function openLiveWindow(live) {
  return openOverlay({
    kind: "window",
    key: LIVE_WINDOW_KEY,
    width: 0.62,
    height: 0.62,
    layout: {
      type: "column",
      children: [
        { type: "block", size: { px: BAR_HEIGHT }, content: { mod: "k9s", props: { role: "live", live } } },
        { type: "block", content: { terminal: live.address } },
      ],
    },
  });
}

export async function startFollow(live) {
  const stopped = await stopAll();
  const source = await resolveSource(live).catch((error) => ({ error: errorText(error) }));
  if (source.error) return { error: source.error };
  const started = await startTerminal(live, source).catch((error) => ({ error: errorText(error) }));
  if (started.error) return { error: started.error };
  const withAddress = { ...live, address: started.address };
  openLiveWindow(withAddress);
  return { live: withAddress, warning: stopped };
}
