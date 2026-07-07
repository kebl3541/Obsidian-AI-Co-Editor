#!/usr/bin/env python3
"""Perplexity bridge for the AI Co-Editor Obsidian plugin.

Runs beside your vault and turns Perplexity into a co-editing collaborator:
it answers chat messages addressed to it and applies selection edit requests,
which then appear in Obsidian as reviewable proposals with their own color.

Setup:
  1. Get an API key from https://www.perplexity.ai/settings/api
  2. Put it in your environment:  export PERPLEXITY_API_KEY=pplx-...
     (or create a .env file next to this script with that line)
  3. In Obsidian: Settings -> AI Co-Editor -> Collaborators -> add "perplexity"
  4. Run:  python3 perplexity-bridge.py "/path/to/YourVault"

Then pick "to: perplexity" in the chat switcher and talk to it.

Only standard library is used; no installs needed.
"""

import json
import os
import re
import sys
import time
import urllib.request

NAME = "perplexity"
MODEL = "sonar"
API_URL = "https://api.perplexity.ai/chat/completions"

CHAT_LINE = re.compile(r"^- \*\*(.+?)\*\* \((.+?)\): (.*)$")
SNIP = re.compile(r"^✂️ (.+?)(?: \[(\d+)-(\d+)\])?: «(.*)» → (.*)$")


def load_key(script_dir: str) -> str:
    key = os.environ.get("PERPLEXITY_API_KEY", "")
    env_path = os.path.join(script_dir, ".env")
    if not key and os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("PERPLEXITY_API_KEY="):
                key = line.split("=", 1)[1].strip()
    if not key:
        sys.exit("No PERPLEXITY_API_KEY found (env var or .env file). See setup notes.")
    return key


def ask(key: str, system: str, user: str) -> str:
    body = json.dumps(
        {
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
    ).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"].strip()


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
        fresh = entries[self.seen :]
        self.seen = len(entries)
        out = []
        for m in fresh:
            author, text = m.group(1), m.group(3)
            name, _, target = author.partition(" → ")
            if name in (NAME, "claude"):
                continue  # not addressed by the human
            if target and target != NAME:
                continue  # addressed to someone else
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

        # Prefer exact offsets when they still match; fall back to searching.
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

        replacement = ask(
            self.key,
            "You rewrite passages of academic prose. Return ONLY the rewritten "
            "passage, no quotes, no commentary. Never use em dashes.",
            f"Instruction: {instruction}\n\nPassage:\n{content[s:e]}",
        )
        self.write_verified(path, content[:s] + replacement + content[e:], replacement)
        self.say(f"Edited {rel}: {instruction}. Waiting in Needs your review.")

    def write_verified(self, path: str, new_content: str, marker: str):
        """Write and confirm the write survived Obsidian's autosave window.

        If the editor's autosave overwrites the change within a couple of
        seconds, re-apply it (the plugin merges it into the open editor).
        """
        for _ in range(3):
            with open(path, "w") as f:
                f.write(new_content)
            time.sleep(2.5)
            if marker in open(path).read():
                return
        # last attempt without waiting; plugin-side merge takes it from here
        with open(path, "w") as f:
            f.write(new_content)

    # ---- main loop -------------------------------------------------------------------

    def run(self):
        print(f"Perplexity bridge watching {self.chat_path}")
        self.say("perplexity connected. Address me with the chat switcher.")
        while True:
            for msg in self.new_messages():
                print("->", msg[:80])
                self.handle(msg)
            time.sleep(2)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 perplexity-bridge.py "/path/to/YourVault"')
    vault = os.path.expanduser(sys.argv[1])
    if not os.path.isdir(os.path.join(vault, ".obsidian")):
        sys.exit(f"{vault} does not look like an Obsidian vault (.obsidian missing)")
    key = load_key(os.path.dirname(os.path.abspath(__file__)))
    Bridge(vault, key).run()
