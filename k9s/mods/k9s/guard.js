const READ_ONLY_VERBS = new Set(["get", "describe", "logs", "top", "api-resources", "version", "config"]);
const READ_ONLY_CONFIG = new Set(["get-contexts", "current-context", "view"]);
const CONTEXT_FREE_CONFIG = new Set(["get-contexts", "current-context"]);
const FORBIDDEN_FLAG = /^(-f|--filename|-w|--watch|--watch-only|--raw|--kubeconfig|--overwrite|--force|--grace-period|--as|--as-group|--as-uid|--token|--server|-s|--user|--username|--password|--cluster|--follow|-k|--kustomize|--edit)(=|$)/;
const SHELL_META = /[;&|`$<>\\"'\n\r\t*?!{}()[\]~#]/;
const SAFE_TOKEN = /^[A-Za-z0-9@%+=:,./_-]*$/;

export const READ_ONLY_ALLOWLIST = {
  verbs: [...READ_ONLY_VERBS].filter((verb) => verb !== "config"),
  config: [...READ_ONLY_CONFIG].map((sub) => `config ${sub}`),
};

function hasExplicitContext(argv) {
  return argv.some((token) => token.startsWith("--context=") && token.length > "--context=".length);
}

function verbRefusal(verb, sub) {
  if (!verb || !READ_ONLY_VERBS.has(verb)) return `k9s is read-only, refused verb: ${verb ?? "(none)"}`;
  if (verb === "config" && (!sub || !READ_ONLY_CONFIG.has(sub))) return `k9s is read-only, refused: kubectl config ${sub ?? ""}`;
  return null;
}

function tokenRefusal(argv, isFollowAllowed) {
  const unsafe = argv.find((token) => typeof token !== "string" || SHELL_META.test(token) || !SAFE_TOKEN.test(token));
  if (unsafe !== undefined) return `k9s refused unsafe argument: ${JSON.stringify(unsafe)}`;
  const forbidden = argv.find((token) => FORBIDDEN_FLAG.test(token) && !(isFollowAllowed && token === "--follow"));
  return forbidden ? `k9s refused flag: ${forbidden}` : null;
}

export const OUTPUT_SELECTOR = "--output=jsonpath={.spec.selector.matchLabels}";
export const OUTPUT_NAMESPACE = "--output=jsonpath={..namespace}";
export const OUTPUT_TARGETS = "--output=custom-columns=NS:.metadata.namespace,NAME:.metadata.name,KIND:.kind,READY:.status.readyReplicas,WANT:.spec.replicas";
const FIXED_OUTPUTS = new Set([OUTPUT_SELECTOR, OUTPUT_NAMESPACE, OUTPUT_TARGETS]);

export function readOnlyRefusal(argv, options = {}) {
  if (!Array.isArray(argv)) return "k9s refused: argv must be an array";
  const [binary, verb, sub] = argv;
  if (binary !== "kubectl") return `k9s only runs kubectl, refused: ${String(binary)}`;
  const refusedVerb = verbRefusal(verb, sub);
  if (refusedVerb) return refusedVerb;
  const isContextFree = verb === "config" && CONTEXT_FREE_CONFIG.has(sub);
  if (!isContextFree && !hasExplicitContext(argv)) return `k9s always names a context, refused: ${argv.join(" ")}`;
  const checked = argv.slice(1).filter((token) => !FIXED_OUTPUTS.has(token));
  return tokenRefusal(checked, options.canFollow === true && verb === "logs");
}
