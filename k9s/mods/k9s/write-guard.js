import { k9sSettings } from "./settings.js";
import { isProdContext } from "./kubectl.js";

export const SHELLS = Object.freeze(["/bin/sh", "/bin/bash", "sh", "bash"]);
export const MAX_REPLICAS = 50;
export const WORKLOAD_KINDS = Object.freeze(["deployment", "statefulset"]);

const OBJECT_NAME = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const LABEL_NAME = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const REPLICAS = /^--replicas=(0|[1-9][0-9]?)$/;
const CONTEXT_PREFIX = "--context=";

export function canWrite(context) {
  if (typeof context !== "string" || !context || isProdContext(context)) return false;
  return k9sSettings().writeContexts.includes(context);
}

function isWritableFlag(token) {
  return typeof token === "string" && token.startsWith(CONTEXT_PREFIX) && canWrite(token.slice(CONTEXT_PREFIX.length));
}

export function deletePodArgv(context, namespace, pod) {
  return ["kubectl", "delete", "pod", pod, "-n", namespace, `--context=${context}`];
}

export function restartArgv(context, namespace, kind, name) {
  return ["kubectl", "rollout", "restart", `${kind}/${name}`, "-n", namespace, `--context=${context}`];
}

export function scaleArgv(context, namespace, kind, name, replicas) {
  return ["kubectl", "scale", `${kind}/${name}`, `--replicas=${replicas}`, "-n", namespace, `--context=${context}`];
}

export function shellArgv(context, namespace, pod, container, shell) {
  return ["kubectl", "exec", "-it", pod, "-c", container, "-n", namespace, `--context=${context}`, "--", shell];
}

function isWorkloadRef(token) {
  const parts = String(token).split("/");
  return parts.length === 2 && WORKLOAD_KINDS.includes(parts[0]) && OBJECT_NAME.test(parts[1]);
}

function isReplicas(token) {
  const match = REPLICAS.exec(String(token));
  return Boolean(match) && Number(match[1]) <= MAX_REPLICAS;
}

function scopedTail(argv, at) {
  return argv[at] === "-n" && LABEL_NAME.test(argv[at + 1]) && isWritableFlag(argv[at + 2]);
}

const SHAPES = {
  delete: (argv) => argv.length === 7 && argv[2] === "pod" && OBJECT_NAME.test(argv[3]) && scopedTail(argv, 4),
  rollout: (argv) => argv.length === 7 && argv[2] === "restart" && isWorkloadRef(argv[3]) && scopedTail(argv, 4),
  scale: (argv) => argv.length === 7 && isWorkloadRef(argv[2]) && isReplicas(argv[3]) && scopedTail(argv, 4),
  exec: (argv) => argv.length === 11 && argv[2] === "-it" && OBJECT_NAME.test(argv[3]) && argv[4] === "-c" && LABEL_NAME.test(argv[5])
    && scopedTail(argv, 6) && argv[9] === "--" && SHELLS.includes(argv[10]),
};

function contextRefusal(argv) {
  const flags = argv.filter((token) => token.startsWith("--context"));
  if (flags.length !== 1) return "k9s write refused: exactly one --context is required";
  return isWritableFlag(flags[0]) ? null : `k9s write refused: context is read-only: ${flags[0].slice(CONTEXT_PREFIX.length) || "(none)"}`;
}

export function writeRefusal(argv) {
  if (!Array.isArray(argv) || argv.some((token) => typeof token !== "string")) return "k9s write refused: argv must be strings";
  if (argv[0] !== "kubectl") return `k9s write refused: only kubectl, not ${String(argv[0])}`;
  const context = contextRefusal(argv);
  if (context) return context;
  const shape = SHAPES[argv[1]];
  if (!shape) return `k9s write refused verb: ${String(argv[1])}`;
  return shape(argv) ? null : `k9s write refused: ${argv.join(" ")}`;
}
