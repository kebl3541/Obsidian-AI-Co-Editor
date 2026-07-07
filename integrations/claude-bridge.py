#!/usr/bin/env python3
"""Claude bridge for the AI Co-Editor Obsidian plugin.

Runs beside your vault and turns Claude (via the Anthropic API) into a
co-editing collaborator: it answers chat messages addressed to it and applies
selection edit requests, which then appear in Obsidian as reviewable
proposals with their own color.

Setup:
  1. Get an API key from https://console.anthropic.com
  2. Put it in your environment:  export ANTHROPIC_API_KEY=sk-ant-...
     (or create a .env file next to this script with that line)
  3. In Obsidian: Settings -> AI Co-Editor -> Collaborators -> add "claude"
  4. Run:  python3 claude-bridge.py "/path/to/YourVault"

Optional environment variables:
  CLAUDE_BRIDGE_MODEL  model id (default: claude-sonnet-5)
  CLAUDE_BRIDGE_NAME   collaborator name (default: claude). Set a different
                       name if a live Claude Code session is already
                       collaborating under "claude" in the same vault.

Only standard library is used; no installs needed.
"""

import json
import os
import re
import sys
import time
import urllib.request

NAME = os.environ.get("CLAUDE_BRIDGE_NAME", "claude")
MODEL = os.environ.get("CLAUDE_BRIDGE_MODEL", "claude-sonnet-5")
API_URL = "https://api.anthropic.com/v1/messages"

CHAT_LINE = re.compile(r"^- \*\*(.+?)\*\* \((.+?)\): (.*)$")
SNIP = re.compile(r"^✂️ (.+?)(?: \[(\d+)-(\d+)\])?: «(.*)» → (.*)$")


def load_key(script_dir: str) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    env_path = os.path.join(script_dir, ".env")
    if not key and os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("ANTHROPIC_API_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("No ANTHROPIC_API_KEY found (env var or .env file). See setup notes.")
    return key


def ask(key: str, system: str, user: str) -> str:
    body = json.dumps(
        {
            "model": MODEL,
            "max_tokens": 2000,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
    ).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read())
    parts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    return "".join(parts).strip()


class Bridge:
    def __init__(self, vault: str, key: str):
        self.vault = vault
        self.key = key
        self.config = os.path.join(vault, ".obsidian")
        self.chat_path = os.path.join(vault, "Co-edit chat.md")
        self.seen = self.count_lines()

    # ---- plugin protocol -----------------------------------------------------

    def announce_identity(self):
        with open(os.path.join(self.config, "live-coedit-collaborator.json"), "w") as f:
            json.dump({"name": NAME}, f)

    def set_status(self, state: str):
        with open(os.path.join(self.config, "live-coedit-status.json"), "w") as f:
            json.dump({"name": NAME, "state": state, "ts": int(time.time() * 1000)}, f)

    def say(self, text: str):
        stamp = time.strftime("%H:%M")
        line = f"- **{NAME}** ({stamp}): {text}\n"
        with open(self.chat_path, "a") as f:
            f.write(line)
        self.seen += 1

    # ---- chat watching ---------------------------------------------------------

    def count_lines(self) -> int:
        if not os.path.exists(self.chat_path):
            return 0
        n = 0
        for line in open(self.chat_path):
            if CHAT_LINE.match(line):
                n += 1
        return n

    def new_messages(self):
        if not os.path.exists(self.chat_path):
            return []
        entries = [m for m in map(CHAT_LINE.match, open(self.chat_path)) if m]
        if len(entries) < self.seen:
            self.seen = len(entries)  # chat was cleared
        fresh = entries[self.seen :]
        self.seen = len(entries)
        out = []
        for m in fresh:
            author, text = m.group(1), m.group(3)
            name, _, target = author.partition(" → ")
            if name == NAME:
                continue  # our own reply
            if target and target != NAME:
                continue  # addressed to someone else
            if not target and name != NAME and CHAT_LINE.match(f"- **{name}** (x): y"):
                # untargeted messages from other AI collaborators are ignored;
                # only human broadcasts and messages to us are handled
                if name in ("claude", "perplexity") and name != NAME:
                    continue
            out.append(text)
        return out

    # ---- actions -----------------------------------------------------------------

    def handle(self, text: str):
        snip = SNIP.match(text)
        self.announce_identity()
        self.set_status("working")
        try:
            if snip:
                self.edit_selection(snip)
            else:
                reply = ask(
                    self.key,
                    "You are a concise writing collaborator inside Obsidian. "
                    "Answer briefly and plainly. Never use em dashes.",
                    text,
                )
                self.say(reply[:800])
        except Exception as e:  # keep the bridge alive on API hiccups
            self.say(f"(bridge error: {e})")
        finally:
            self.set_status("idle")

    def edit_selection(self, m: re.Match):
        rel, start, end, quoted, instruction = m.groups()
        path = os.path.join(self.vault, rel)
        if not os.path.exists(path):
            self.say(f"Could not find {rel}.")
            return
        content = open(path).read()
        passage = quoted.replace("\\n", "\n").replace("\\\\", "\\")

        s = e = None
        if start is not None:
            s, e = int(start), int(end)
            if content[s:e] != passage and "[…]" not in passage:
                s = e = None
        if s is None:
            idx = content.find(passage)
            if idx < 0:
                self.say("Could not locate the selected passage; it may have changed.")
                return
            s, e = idx, idx + len(passage)
        # Use the exact on-disk text (the quoted form may be truncated).
        passage = content[s:e]

        replacement = ask(
            self.key,
            "You rewrite passages of academic prose. Return ONLY the rewritten "
            "passage, no quotes, no commentary. Never use em dashes.",
            f"Instruction: {instruction}\n\nPassage:\n{content[s:e]}",
        )
        ok = self.apply_verified(path, passage, replacement)
        self.say(
            f"Edited {rel}: {instruction}. Waiting in Needs your review."
            if ok
            else f"Could not apply the edit to {rel}; the passage kept changing."
        )

    def apply_verified(self, path: str, passage: str, replacement: str) -> bool:
        """Apply a replacement against FRESH file content, then confirm it
        survived Obsidian's autosave window; retry a few times if not."""
        for _ in range(4):
            content = open(path).read()
            if replacement in content:
                return True
            idx = content.find(passage)
            if idx < 0:
                return False
            with open(path, "w") as f:
                f.write(content[:idx] + replacement + content[idx + len(passage):])
            time.sleep(2.5)
        return replacement in open(path).read()

    # ---- main loop -------------------------------------------------------------------

    def run(self):
        print(f"Claude bridge ({MODEL}) watching {self.chat_path}")
        while True:
            for msg in self.new_messages():
                print("->", msg[:80])
                self.handle(msg)
            time.sleep(2)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 claude-bridge.py "/path/to/YourVault"')
    vault = os.path.expanduser(sys.argv[1])
    if not os.path.isdir(os.path.join(vault, ".obsidian")):
        sys.exit(f"{vault} does not look like an Obsidian vault (.obsidian missing)")
    key = load_key(os.path.dirname(os.path.abspath(__file__)))
    Bridge(vault, key).run()
