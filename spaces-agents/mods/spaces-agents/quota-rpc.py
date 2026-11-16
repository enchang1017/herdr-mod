import json
import os
import shutil
import subprocess
import sys
import threading

PROBES = {
    "codex": (
        ["codex", "--no-daemon", "app-server"],
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


def stop(proc, shell):
    if proc.poll() is not None:
        return
    if os.name == "nt" and shell:
        # npm's .cmd wrapper may have spawned node: clean up that tree too.
        try:
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW, timeout=5)
        except subprocess.TimeoutExpired:
            pass
    if proc.poll() is None:
        proc.kill()


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in PROBES:
        fail(2, "usage: quota-rpc.py codex|grok")
    command, requests = PROBES[sys.argv[1]]
    program = command[0]
    resolved = shutil.which(program)
    if not resolved:
        fail(3, f"{program} is not installed")
    command = [resolved, *command[1:]]
    shell = os.name == "nt" and resolved.lower().endswith((".cmd", ".bat"))
    if shell:
        # The executable can contain cmd metacharacters even without spaces.
        # Probe arguments above are fixed; always quote the resolved path.
        command = '"' + resolved + '" ' + subprocess.list2cmdline(command[1:])
    try:
        proc = subprocess.Popen(command, shell=shell, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except FileNotFoundError:
        fail(3, f"{program} is not installed")
    errs = []
    drain = threading.Thread(target=lambda: errs.extend(proc.stderr), daemon=True)
    drain.start()
    timer = threading.Timer(TIMEOUT_S, stop, args=(proc, shell))
    timer.start()
    try:
        proc.stdin.write("".join(json.dumps(r) + "\n" for r in requests))
        proc.stdin.flush()
        msg = answer(proc)
    finally:
        timer.cancel()
        stop(proc, shell)
        proc.wait()
        drain.join(1)
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            try:
                stream.close()
            except OSError:
                pass
    if msg is None:
        drain.join(1)
        err = "".join(errs).strip()[-300:]
        fail(4, f"{program} gave no answer within {TIMEOUT_S}s{': ' + err if err else ''}")
    if "error" in msg:
        fail(5, f"{program} refused: {msg['error'].get('message', msg['error'])}")
    print(json.dumps(msg.get("result")))


if __name__ == "__main__":
    main()
