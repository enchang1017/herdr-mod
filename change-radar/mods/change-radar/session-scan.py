import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime

CACHE_VERSION = 4
CACHE_LIMIT = 300
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
GIT_CMD = r"\bgit\b(?:\s+-[Cc]\s+(?:\"[^\"]+\"|'[^']+'|\S+))*\s+"
COMMIT_RE = re.compile(GIT_CMD + r"commit\b")
PUSH_RE = re.compile(GIT_CMD + r"push\b")
GIT_DIR_RE = re.compile(r"\bgit\s+-C\s+(\"[^\"]+\"|'[^']+'|\S+)")
CD_RE = re.compile(r"(?:^|&&|;|\|\||\n|\()\s*(?:cd|pushd)\s+(\"[^\"]+\"|'[^']+'|[^\s;&|)]+)")
BRACKET_RE = re.compile(r"^\[([^\]\s]+)(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.*)$", re.M)
ONELINE_RE = re.compile(r"^([0-9a-f]{7,40}) (.+)$", re.M)
MSG_RE = re.compile(r"-m\s+(?:\"((?:[^\"\\]|\\.)*)\"|'([^']*)')")
HEREDOC_RE = re.compile(r"<<-?\s*'?\"?(\w+)'?\"?\n(.*?)\n\s*\1", re.S)
WINDOW = 600
BASH_TOKEN_LIMIT = 200
WRITE_RE = re.compile(r"(?<![0-9&>])>>?\s*(?!/dev/null|&)[^\s>]|\btee\b|\bsed\s+(?:-[a-zA-Z]*\s+)*-i|\bperl\s+-[a-zA-Z]*i|open\([^)]*['\"][wa]['\"+]|write_text|\.write\(|\bmv\s|\bcp\s|\bgit\s+(?:-C\s+\S+\s+)?(?:apply|checkout|restore|mv)\b|\bpatch\b|dotnet\s+format|prettier|--fix\b")
PATH_TOKEN_RE = re.compile(r"(?<![\w./~$-])((?:~|\.{1,2})?/?[\w@-][\w.@-]*(?:/[\w.@-]+)*\.(?:cs|csproj|sln|slnx|props|targets|ts|tsx|js|jsx|mjs|vue|json|sql|py|md|ya?ml|xml|sh|razor|cshtml|scss|css|html|txt|config|proto))(?![\w/-])")


def stamp(record):
    raw = record.get("timestamp")
    if not isinstance(raw, str):
        return 0
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0


def unquote(text):
    return text[1:-1] if len(text) > 1 and text[0] in "\"'" and text[-1] == text[0] else text


def resolve(path, cwd):
    path = os.path.expanduser(unquote(path).replace("$HOME", os.path.expanduser("~")))
    return os.path.normpath(path if os.path.isabs(path) else os.path.join(cwd or "/", path))


def command_dir(command, match, cwd):
    current = cwd
    for hop in (m.group(1) for m in CD_RE.finditer(command) if m.start() < match.start()):
        current = resolve(hop, current)
    explicit = GIT_DIR_RE.search(match.group(0))
    return resolve(explicit.group(1), current) if explicit else current


def final_dir(command, cwd):
    current = cwd
    for m in CD_RE.finditer(command):
        current = resolve(m.group(1), current)
    return current


def bash_writes(use, out):
    command = use["command"]
    if not WRITE_RE.search(command):
        return
    base = final_dir(command, use["cwd"])
    seen = {resolve(m.group(1), base) for m in PATH_TOKEN_RE.finditer(command)}
    out["bashEdits"].extend({"path": p, "at": use["at"], "tool": "Bash"} for p in sorted(seen)[:BASH_TOKEN_LIMIT])


def commit_subject(command):
    m = MSG_RE.search(command)
    if m:
        return (m.group(1) or m.group(2) or "").replace('\\"', '"').strip().split("\n")[0]
    h = HEREDOC_RE.search(command)
    return h.group(2).strip().split("\n")[0] if h else ""


def result_text(block):
    content = block.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(c.get("text", "") for c in content if isinstance(c, dict))
    return ""


def tool_uses(record, pending):
    for block in record.get("message", {}).get("content", []) or []:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        name, data = block.get("name"), block.get("input") or {}
        base = {"name": name, "at": stamp(record), "cwd": record.get("cwd")}
        if name in EDIT_TOOLS:
            path = data.get("file_path") or data.get("notebook_path")
            if isinstance(path, str) and path:
                pending[block.get("id")] = {**base, "path": resolve(path, record.get("cwd"))}
        elif name == "Bash" and isinstance(data.get("command"), str):
            pending[block.get("id")] = {**base, "command": data["command"]}


def bash_result(use, text, at, out):
    command = use["command"]
    commit = COMMIT_RE.search(command)
    if commit:
        bracket = [m.group(2) for m in BRACKET_RE.finditer(text)]
        oneline = [m.group(1) for m in ONELINE_RE.finditer(text)]
        out["commits"].append({"dir": command_dir(command, commit, use["cwd"]), "at": use["at"], "end": at,
                               "strong": bracket, "weak": oneline[:20], "subject": commit_subject(command)})
    push = PUSH_RE.search(command)
    if push:
        out["pushes"].append({"dir": command_dir(command, push, use["cwd"]), "at": at})


def tool_results(record, pending, out):
    content = record.get("message", {}).get("content")
    if not isinstance(content, list):
        return
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "tool_result":
            continue
        use = pending.pop(block.get("tool_use_id"), None)
        if not use:
            continue
        if "path" in use and not block.get("is_error"):
            out["edits"].append({"path": use["path"], "at": use["at"], "tool": use["name"]})
        elif "command" in use:
            bash_result(use, result_text(block), stamp(record) or use["at"], out)
            if not block.get("is_error"):
                bash_writes(use, out)


def parse_file(path):
    out = {"edits": [], "commits": [], "pushes": [], "bashEdits": []}
    pending = {}
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            has_use, has_result = '"tool_use"' in line, '"tool_result"' in line
            if not has_use and not has_result:
                continue
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if record.get("type") == "assistant" and has_use:
                tool_uses(record, pending)
            elif record.get("type") == "user" and has_result:
                tool_results(record, pending, out)
    return out


def load_cache(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if data.get("version") == CACHE_VERSION else {"version": CACHE_VERSION, "files": {}}
    except (OSError, ValueError):
        return {"version": CACHE_VERSION, "files": {}}


def save_cache(path, cache):
    files = sorted(cache["files"].items(), key=lambda kv: kv[1].get("used", 0), reverse=True)[:CACHE_LIMIT]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump({"version": CACHE_VERSION, "files": dict(files)}, handle)
    os.replace(tmp, path)


def parsed(path, cache, now):
    st = os.stat(path)
    hit = cache["files"].get(path)
    if hit and hit["size"] == st.st_size and hit["mtime"] == st.st_mtime:
        cache["files"][path] = {**hit, "used": now}
        return hit["data"], True
    data = parse_file(path)
    cache["files"][path] = {"size": st.st_size, "mtime": st.st_mtime, "data": data, "used": now}
    return data, False


def transcripts(projects, sid):
    mains = sorted(p for p in (os.path.join(projects, d, sid + ".jsonl") for d in os.listdir(projects)) if os.path.isfile(p))
    found = []
    for main in mains:
        found.append({"path": main, "agent": False})
        sub = os.path.join(os.path.dirname(main), sid, "subagents")
        for root, _dirs, names in os.walk(sub):
            found.extend({"path": os.path.join(root, n), "agent": True} for n in sorted(names) if n.endswith(".jsonl"))
    return found


def git(repo, args):
    try:
        r = subprocess.run(["git", "--no-optional-locks", "-C", repo, *args], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 else None


class Repos:
    def __init__(self):
        self.tops = {}

    def top(self, path):
        probe = path
        while probe and probe != "/" and not os.path.isdir(probe):
            probe = os.path.dirname(probe)
        if probe not in self.tops:
            out = git(probe, ["rev-parse", "--show-toplevel"]) if probe else None
            self.tops[probe] = os.path.realpath(out.strip()) if out and out.strip() else None
        return self.tops[probe]


NO_GROUPS = {"dbRepoPrefixes": [], "testRepos": [], "frontendRepos": []}


def parse_groups(text):
    try:
        value = json.loads(text)
    except ValueError:
        return NO_GROUPS
    if not isinstance(value, dict):
        return NO_GROUPS
    return {k: [str(v).lower() for v in value.get(k) or [] if isinstance(v, str) and v] for k in NO_GROUPS}


def classify(repo, groups):
    name = os.path.basename(repo).lower()
    if name.startswith(tuple(groups["dbRepoPrefixes"])) or name.endswith(".db"):
        return "DB"
    if name in groups["testRepos"] or name.startswith(("e2e.", "e2e-")):
        return "TESTS"
    if has_dotnet(repo):
        return "SERVICE"
    if is_ui(repo, name, groups["frontendRepos"]):
        return "UI"
    return "OTHER"


def has_dotnet(repo):
    for root, dirs, names in os.walk(repo):
        if any(n.endswith((".sln", ".slnx", ".csproj")) for n in names):
            return True
        depth = root[len(repo):].count(os.sep)
        dirs[:] = [] if depth >= 2 else [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "bin", "obj")]
    return False


def is_ui(repo, name, frontend):
    if frontend and name.startswith(tuple(frontend)):
        return True
    try:
        with open(os.path.join(repo, "package.json"), "r", encoding="utf-8") as handle:
            pkg = json.load(handle)
    except (OSError, ValueError):
        return False
    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    return any(k in deps for k in ("vue", "nuxt", "react", "next", "react-dom"))


def verify(repo, sha, lo, hi):
    out = git(repo, ["log", "-1", "--format=%H%x1f%h%x1f%s%x1f%ct", sha, "--"])
    if not out or "\x1f" not in out:
        return None
    full, short, subject, ct = out.strip().split("\x1f", 3)
    at = int(ct or 0)
    return {"sha": full, "short": short, "subject": subject, "at": at} if lo <= at <= hi else None


def by_subject(repo, subject, lo, hi):
    if not subject:
        return []
    out = git(repo, ["log", "--all", f"--since=@{int(lo)}", f"--until=@{int(hi)}", "--format=%H%x1f%h%x1f%s%x1f%ct"]) or ""
    rows = [line.split("\x1f", 3) for line in out.splitlines() if line.count("\x1f") == 3]
    return [{"sha": r[0], "short": r[1], "subject": r[2], "at": int(r[3] or 0)} for r in rows if r[2].strip() == subject.strip()][:1]


def resolve_commit(repo, c):
    lo, hi = c["at"] - WINDOW, (c["end"] or c["at"]) + WINDOW
    strong = [v for v in (verify(repo, s, lo - 86400 * 30, hi) for s in c["strong"]) if v]
    if strong:
        return strong
    weak = [v for v in (verify(repo, s, lo, hi) for s in c["weak"]) if v]
    matching = [v for v in weak if c["subject"] and v["subject"].strip() == c["subject"].strip()]
    return matching or by_subject(repo, c["subject"], lo, hi) or weak[:1]


def entry(repos_out, repo):
    return repos_out.setdefault(repo, {"repo": repo, "edits": {}, "commits": {}, "pushes": 0, "unresolved": []})


def add_edits(edits, repos, repos_out, outside, via):
    for e in edits:
        real = os.path.realpath(e["path"])
        top = repos.top(real)
        if not top or not real.startswith(top + os.sep):
            if via == "edit":
                outside.add(e["path"])
            continue
        files = entry(repos_out, top)["edits"]
        rel = real[len(top) + 1:]
        old = files.get(rel, {"count": 0, "at": 0, "via": via})
        files[rel] = {"count": old["count"] + 1, "at": max(old["at"], e["at"]), "via": "edit" if "edit" in (old["via"], via) else via}


def add_commits(commits, pushes, repos, repos_out):
    for c in commits:
        top = repos.top(os.path.realpath(c["dir"] or "/"))
        if not top:
            continue
        found = resolve_commit(top, c)
        target = entry(repos_out, top)
        target["commits"].update({f["sha"]: f for f in found})
        if not found:
            target["unresolved"].append(c["subject"] or "(no message)")
    for p in pushes:
        top = repos.top(os.path.realpath(p["dir"] or "/"))
        if top:
            entry(repos_out, top)["pushes"] += 1


def scan(projects, sid, cache_path, groups):
    cache, now = load_cache(cache_path), datetime.now().timestamp()
    files = transcripts(projects, sid)
    edits, commits, pushes, listed, bash = [], [], [], [], []
    for f in files:
        data, hit = parsed(f["path"], cache, now)
        edits += data["edits"]; commits += data["commits"]; pushes += data["pushes"]; bash += data["bashEdits"]
        listed.append({**f, "cached": hit, "edits": len(data["edits"]), "bashEdits": len(data["bashEdits"]), "commits": len(data["commits"])})
    save_cache(cache_path, cache)
    repos, repos_out, outside = Repos(), {}, set()
    add_edits(edits, repos, repos_out, outside, "edit")
    add_edits(bash, repos, repos_out, outside, "bash")
    add_commits(commits, pushes, repos, repos_out)
    out = [{**r, "group": classify(r["repo"], groups), "edits": [{"path": k, **v} for k, v in sorted(r["edits"].items())],
            "commits": sorted(r["commits"].values(), key=lambda c: c["at"])} for r in repos_out.values()]
    return {"sessionId": sid, "transcripts": listed, "repos": out, "outside": sorted(outside)[:50], "outsideCount": len(outside)}


def main(argv):
    mode = argv[1] if len(argv) > 1 else ""
    if mode == "scan" and len(argv) in (5, 6) and re.fullmatch(r"[\w-]+", argv[3]):
        return scan(argv[2], argv[3], argv[4], parse_groups(argv[5]) if len(argv) == 6 else NO_GROUPS)
    raise SystemExit("usage: session-scan.py scan <projects> <sessionId> <cache> [groups-json]")


if __name__ == "__main__":
    json.dump(main(sys.argv), sys.stdout)
