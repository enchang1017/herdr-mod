import json
import subprocess
import sys
import threading

PROBES = {
    "codex": (
        ["codex", "app-server"],
        [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"clientInfo": {"name": "herdr-quota", "version": "1.0.0"}}},
            {"jsonrpc": "2.0", "method": "initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "account/rateLimits/read"},
        ],
    ),
    "grok": (
        ["grok", "agent", "stdio"],
        [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": 1, "clientCapabilities": {}}},
            {"jsonrpc": "2.0", "id": 2, "method": "_x.ai/billing", "params": {}},
        ],
    ),
}

TIMEOUT_S = 30


def fail(code, text):
    sys.stderr.write(text + "\n")
    sys.exit(code)


def answer(proc):
    for line in proc.stdout:
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if msg.get("id") == 2:
            return msg
    return None


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in PROBES:
        fail(2, "usage: quota-rpc.py codex|grok")
    command, requests = PROBES[sys.argv[1]]
    try:
        proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except FileNotFoundError:
        fail(3, f"{command[0]} is not installed")
    errs = []
    drain = threading.Thread(target=lambda: errs.extend(proc.stderr), daemon=True)
    drain.start()
    timer = threading.Timer(TIMEOUT_S, proc.kill)
    timer.start()
    try:
        proc.stdin.write("".join(json.dumps(r) + "\n" for r in requests))
        proc.stdin.flush()
        msg = answer(proc)
    finally:
        timer.cancel()
        proc.kill()
        proc.wait()
    if msg is None:
        drain.join(1)
        err = "".join(errs).strip()[-300:]
        fail(4, f"{command[0]} gave no answer within {TIMEOUT_S}s{': ' + err if err else ''}")
    if "error" in msg:
        fail(5, f"{command[0]} refused: {msg['error'].get('message', msg['error'])}")
    print(json.dumps(msg.get("result")))


if __name__ == "__main__":
    main()
