import functools
import json
import os
import re
import sys

TITLE_BYTES = 262144
TEAMMATE_RE = re.compile(r"^<teammate-message[^>]*>\s*")
COMMAND_NAME_RE = re.compile(r"<command-name>([^<]*)</command-name>(?:[\s\S]*?<command-args>([^<]*)</command-args>)?")
TEMPLATES_DIR = os.path.expanduser("~/.config/herdr-core/templates")
FRONTMATTER_RE = re.compile(r"^---\n[\s\S]*?\n---\n?")


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


def prompt_of(content):
    blocks = [content] if isinstance(content, str) else [b.get("text") or "" for b in content if isinstance(b, dict) and b.get("type") == "text"] if isinstance(content, list) else []
    for text in (TEAMMATE_RE.sub("", t.strip()) for t in blocks):
        if text and not text.startswith(("<", "Caveat:")):
            return without_template(text)[:120]
    return None


def first_prompt(path):
    cwd, title, command = None, None, None
    try:
        with open(path, "rb") as handle:
            head = handle.read(TITLE_BYTES)
    except OSError:
        return None, None, None
    for line in (x for x in head.split(b"\n") if b'"cwd"' in x or b'"type":"user"' in x):
        if cwd and title:
            break
        try:
            record = json.loads(line)
        except ValueError:
            continue
        cwd = cwd or record.get("cwd")
        if record.get("type") != "user" or record.get("isMeta"):
            continue
        content = (record.get("message") or {}).get("content")
        title = title or prompt_of(content)
        found = None if command else COMMAND_NAME_RE.search(json.dumps(content, ensure_ascii=False))
        command = command or (" ".join(g.strip() for g in found.groups() if g and g.strip()) if found else None)
    return cwd, title, command


def transcript_of(projects, sid, cwd):
    guess = os.path.join(projects, re.sub(r"[^A-Za-z0-9]", "-", cwd or ""), sid + ".jsonl")
    return guess if os.path.isfile(guess) else next((p for p in (os.path.join(projects, d, sid + ".jsonl") for d in os.listdir(projects)) if os.path.isfile(p)), None)


def titled(projects, s):
    path = transcript_of(projects, s["sessionId"], s.get("cwd"))
    _cwd, title, command = first_prompt(path) if path else (None, None, None)
    return {**s, "title": title, "command": command}


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except (OSError, ValueError):
        return False


def live_sessions(sessions_dir):
    out = {}
    for name in os.listdir(sessions_dir) if os.path.isdir(sessions_dir) else []:
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(sessions_dir, name), "r", encoding="utf-8") as handle:
                s = json.load(handle)
        except (OSError, ValueError):
            continue
        pid, sid = s.get("pid"), s.get("sessionId")
        if isinstance(pid, int) and isinstance(sid, str) and alive(pid):
            keep = out.get(sid)
            if not keep or (s.get("updatedAt") or 0) > (keep.get("updatedAt") or 0):
                out[sid] = {k: s.get(k) for k in ("pid", "sessionId", "name", "cwd", "status", "updatedAt", "startedAt")}
    return sorted(out.values(), key=lambda s: s.get("updatedAt") or 0, reverse=True)


def recent(projects, prefix, limit):
    dirs = [d for d in os.listdir(projects) if d == prefix or d.startswith(prefix + "-")]
    paths = [os.path.join(projects, d, n) for d in dirs for n in os.listdir(os.path.join(projects, d)) if n.endswith(".jsonl")]
    stats = sorted(((p, os.stat(p)) for p in paths), key=lambda ps: ps[1].st_mtime, reverse=True)[:limit]
    rows = []
    for p, st in stats:
        cwd, title, command = first_prompt(p)
        rows.append({"sessionId": os.path.basename(p)[:-6], "path": p, "mtime": st.st_mtime, "size": st.st_size, "cwd": cwd, "title": title, "command": command})
    return rows


def main(argv):
    if len(argv) == 6 and argv[1] == "list":
        return {"live": [titled(argv[2], s) for s in live_sessions(argv[3])], "recent": recent(argv[2], argv[4], int(argv[5]))}
    raise SystemExit("usage: session-list.py list <projects> <sessions> <prefix> <limit>")


if __name__ == "__main__":
    json.dump(main(sys.argv), sys.stdout)
