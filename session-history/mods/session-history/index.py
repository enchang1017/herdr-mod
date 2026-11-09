import functools
import json
import os
import re
import shutil
import subprocess
import sys
import time

HOME = os.path.expanduser("~")
CLAUDE_PROJECTS = os.path.join(HOME, ".claude", "projects")
CLAUDE_SESSIONS = os.path.join(HOME, ".claude", "sessions")
CODEX_SESSIONS = os.path.join(HOME, ".codex", "sessions")
CACHE_VERSION = 3
INDEX_BUDGET_S = 18.0
SEARCH_BUDGET_S = 20.0
TITLE_MAX = 200
SNIPPET_SIDE = 70
BRANCH_RE = re.compile(rb'"gitBranch":"([^"]*)"')
CWD_RE = re.compile(rb'"cwd":"([^"]*)"')
COMMAND_RE = re.compile(r"<command-name>([^<]*)</command-name>(?:[\s\S]*?<command-args>([^<]*)</command-args>)?")
TEAMMATE_RE = re.compile(r"^<teammate-message[^>]*>\s*")
CODEX_CWD_RE = re.compile(r"<cwd>([^<]*)</cwd>")
TEMPLATES_DIR = os.path.join(HOME, ".config", "herdr-core", "templates")
FRONTMATTER_RE = re.compile(r"^---\n[\s\S]*?\n---\n?")
CODEX_ID_RE = re.compile(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$")


def claude_files():
    if not os.path.isdir(CLAUDE_PROJECTS):
        return []
    found = []
    for project in os.scandir(CLAUDE_PROJECTS):
        if not project.is_dir():
            continue
        for entry in os.scandir(project.path):
            if entry.is_file() and entry.name.endswith(".jsonl"):
                found.append(("claude", entry.path))
    return found


def codex_files():
    if not os.path.isdir(CODEX_SESSIONS):
        return []
    found = []
    for root, _dirs, names in os.walk(CODEX_SESSIONS):
        found.extend(("codex", os.path.join(root, n)) for n in names if n.endswith(".jsonl"))
    return found


def parse(line):
    try:
        value = json.loads(line)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def block_texts(content):
    if isinstance(content, str):
        return [content]
    if not isinstance(content, list):
        return []
    return [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") in ("text", "input_text", "output_text")]


def template_body(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            text = handle.read().replace("\r\n", "\n")
    except OSError:
        return ""
    front = FRONTMATTER_RE.match(text)
    return text[front.end():].strip() if front else ""


@functools.lru_cache(maxsize=1)
def templates():
    names = sorted(n for n in os.listdir(TEMPLATES_DIR) if n.endswith(".md")) if os.path.isdir(TEMPLATES_DIR) else []
    bodies = [(n[:-3], template_body(os.path.join(TEMPLATES_DIR, n))) for n in names]
    found = [(name, " ".join(body.split()), " ".join(body.split("\n\n")[0].split())) for name, body in bodies if body]
    return tuple(sorted(found, key=lambda t: -len(t[1])))


def without_template(raw):
    text = " ".join(raw.split())
    hit = next((t for t in templates() if text.startswith(t[1])), None)
    if hit:
        return text[len(hit[1]):].strip() or hit[0]
    older = next((t for t in templates() if text.startswith(t[2])), None)
    return (" ".join(raw.strip().split("\n\n")[-1].split()) or older[0]) if older else text


def prompt_text(content):
    for text in block_texts(content):
        clean = TEAMMATE_RE.sub("", text.strip())
        if clean and not clean.startswith("<") and not clean.startswith("Caveat:"):
            return without_template(clean)[:TITLE_MAX]
    return None


def command_text(content):
    for text in block_texts(content):
        match = COMMAND_RE.search(text)
        if match:
            return " ".join(part for part in (match.group(1), (match.group(2) or "").strip()) if part)[:TITLE_MAX]
    return None


def claude_line(fields, line):
    if fields.get("branch") is None or b'"gitBranch"' in line:
        match = BRANCH_RE.search(line)
        if match and match.group(1):
            fields["branch"] = match.group(1).decode("utf-8", "replace")
    if not fields.get("cwd") and b'"cwd"' in line:
        match = CWD_RE.search(line)
        if match:
            fields["cwd"] = json.loads(b'"' + match.group(1) + b'"')
    if b'"custom-title"' in line or b'"agent-name"' in line:
        entry = parse(line) or {}
        name = entry.get("customTitle") or entry.get("agentName")
        if isinstance(name, str) and name.strip():
            fields["name"] = name.strip()
    if not fields.get("title") and b'"type":"user"' in line:
        entry = parse(line) or {}
        if entry.get("type") == "user" and not entry.get("isMeta"):
            content = (entry.get("message") or {}).get("content")
            fields["title"] = prompt_text(content)
            fields["command"] = fields.get("command") or command_text(content)


def codex_line(fields, line):
    entry = parse(line)
    if entry is None:
        return
    payload = entry.get("payload") if isinstance(entry.get("payload"), dict) else entry
    if isinstance(payload.get("cwd"), str) and not fields.get("cwd"):
        fields["cwd"] = payload["cwd"]
    git = payload.get("git")
    if isinstance(git, dict) and git.get("branch"):
        fields["branch"] = git["branch"]
    if isinstance(git, dict) and isinstance(git.get("repository_url"), str):
        fields["repo"] = git["repository_url"].rstrip("/").split("/")[-1].removesuffix(".git")
    if payload.get("type") == "message" and payload.get("role") == "user":
        texts = block_texts(payload.get("content"))
        cwd = next((m.group(1) for t in texts for m in [CODEX_CWD_RE.search(t)] if m), None)
        if cwd and not fields.get("cwd"):
            fields["cwd"] = cwd
        if not fields.get("title"):
            fields["title"] = prompt_text(payload.get("content"))


def scan(kind, path, start, fields):
    step = claude_line if kind == "claude" else codex_line
    with open(path, "rb") as handle:
        handle.seek(start)
        offset = start
        for line in handle:
            if not line.endswith(b"\n"):
                break
            offset += len(line)
            step(fields, line)
    return offset


def session_id(kind, path):
    if kind == "claude":
        return os.path.basename(path)[:-6]
    match = CODEX_ID_RE.search(path)
    return match.group(1) if match else os.path.basename(path)[:-6]


def index_file(kind, path, stat, cached):
    grows = cached and cached["size"] <= stat.st_size and cached.get("offset", 0) <= stat.st_size
    fields = dict(cached["fields"]) if grows else {}
    start = cached.get("offset", 0) if grows else 0
    offset = scan(kind, path, start, fields)
    return {"size": stat.st_size, "mtime": stat.st_mtime, "offset": offset, "kind": kind, "fields": fields}


def load_cache(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data["files"] if data.get("version") == CACHE_VERSION else {}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def save_cache(path, files):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp = f"{path}.tmp.{os.getpid()}"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump({"version": CACHE_VERSION, "files": files}, handle)
    os.replace(temp, path)


def refresh(cache, files, deadline):
    fresh, errors, pending = {}, [], False
    for kind, path in sorted(files, key=lambda f: -safe_mtime(f[1])):
        try:
            stat = os.stat(path)
        except OSError:
            continue
        old = cache.get(path)
        if old and old["size"] == stat.st_size and old["mtime"] == stat.st_mtime:
            fresh[path] = old
            continue
        if time.monotonic() > deadline:
            pending = True
            if old:
                fresh[path] = old
            continue
        try:
            fresh[path] = index_file(kind, path, stat, old)
        except OSError as error:
            errors.append(f"{path}: {error}")
    return fresh, errors, pending


def safe_mtime(path):
    try:
        return os.stat(path).st_mtime
    except OSError:
        return 0


def pid_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False


def live_sessions():
    if not os.path.isdir(CLAUDE_SESSIONS):
        return {}
    live = {}
    for entry in os.scandir(CLAUDE_SESSIONS):
        if not entry.name.endswith(".json"):
            continue
        try:
            with open(entry.path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            continue
        pid, sid = data.get("pid"), data.get("sessionId")
        if isinstance(pid, int) and isinstance(sid, str) and pid_alive(pid):
            live[sid] = {"pid": pid, "name": data.get("name") if data.get("nameSource") != "derived" else None}
    return live


def repo_root(cwd, memo):
    if not cwd:
        return None
    if cwd in memo:
        return memo[cwd]
    probe, found = cwd, None
    while probe and probe != "/":
        if os.path.exists(os.path.join(probe, ".git")):
            found = probe
            break
        probe = os.path.dirname(probe)
    memo[cwd] = found
    return found


def session_row(path, record, live, memo):
    fields = record["fields"]
    sid = session_id(record["kind"], path)
    running = live.get(sid) if record["kind"] == "claude" else None
    root = repo_root(fields.get("cwd"), memo)
    return {
        "id": sid, "kind": record["kind"], "path": path, "cwd": fields.get("cwd"),
        "title": fields.get("title") or fields.get("command"), "name": (running or {}).get("name") or fields.get("name"),
        "branch": fields.get("branch"), "repo": os.path.basename(root) if root else fields.get("repo"),
        "mtime": record["mtime"], "size": record["size"], "pid": (running or {}).get("pid"),
    }


def keep_row(record):
    if record["kind"] == "claude":
        return record["size"] > 0
    return bool(record["fields"].get("title"))


def run_index(cache_path):
    deadline = time.monotonic() + INDEX_BUDGET_S
    files, errors, pending = refresh(load_cache(cache_path), claude_files() + codex_files(), deadline)
    try:
        save_cache(cache_path, files)
    except OSError as error:
        errors.append(f"cache: {error}")
    live, memo = live_sessions(), {}
    rows = [session_row(p, r, live, memo) for p, r in files.items() if keep_row(r)]
    rows.sort(key=lambda r: -r["mtime"])
    return {"sessions": rows, "pending": pending, "errors": errors[:5]}


def entry_texts(entry):
    if entry.get("type") in ("user", "assistant"):
        return block_texts((entry.get("message") or {}).get("content"))
    payload = entry.get("payload") if isinstance(entry.get("payload"), dict) else entry
    if payload.get("type") == "message" and payload.get("role") in ("user", "assistant"):
        return block_texts(payload.get("content"))
    return []


def snippet(text, needle):
    lower = text.lower()
    at = lower.find(needle)
    if at < 0:
        return None
    start, end = max(0, at - SNIPPET_SIDE), min(len(text), at + len(needle) + SNIPPET_SIDE)
    body = " ".join(text[start:end].split())
    return ("…" if start > 0 else "") + body + ("…" if end < len(text) else "")


def file_hit(path, needle, raw):
    with open(path, "rb") as handle:
        for line in handle:
            if raw not in line.lower():
                continue
            entry = parse(line)
            if entry is None:
                continue
            for text in entry_texts(entry):
                found = snippet(text, needle)
                if found:
                    return found
    return None


def candidate_files(needle):
    files = claude_files() + codex_files()
    rg = shutil.which("rg")
    if not rg:
        return files
    roots = [r for r in (CLAUDE_PROJECTS, CODEX_SESSIONS) if os.path.isdir(r)]
    done = subprocess.run([rg, "-l", "-i", "-F", "--no-messages", "-g", "*.jsonl", "--", needle, *roots],
                          capture_output=True, timeout=SEARCH_BUDGET_S)
    if done.returncode not in (0, 1):
        return files
    matched = set(os.fsdecode(p) for p in done.stdout.splitlines())
    return [f for f in files if f[1] in matched]


def run_search(query, limit):
    needle = query.strip().lower()
    if not needle:
        return {"hits": [], "truncated": False}
    raw = needle.encode("utf-8")
    deadline = time.monotonic() + SEARCH_BUDGET_S
    files = sorted(candidate_files(needle), key=lambda f: -safe_mtime(f[1]))
    hits, truncated = [], False
    for kind, path in files:
        if len(hits) >= limit or time.monotonic() > deadline:
            truncated = True
            break
        try:
            found = file_hit(path, needle, raw)
        except OSError:
            continue
        if found:
            hits.append({"id": session_id(kind, path), "path": path, "snippet": found})
    return {"hits": hits, "truncated": truncated}


def main(argv):
    if len(argv) >= 3 and argv[1] == "index":
        result = run_index(argv[2])
    elif len(argv) >= 4 and argv[1] == "search":
        result = run_search(argv[2], int(argv[3]))
    else:
        print(json.dumps({"error": "usage: index.py index <cache> | search <query> <limit>"}))
        return 2
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
