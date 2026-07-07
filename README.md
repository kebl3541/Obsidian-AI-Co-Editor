# Live Co-Edit

[![Downloads](https://img.shields.io/github/downloads/kebl3541/Obsidian-Live-CoEdit/total?style=flat&logo=github&label=Downloads&color=success)](https://github.com/kebl3541/Obsidian-Live-CoEdit/releases)
[![GitHub stars](https://img.shields.io/github/stars/kebl3541/Obsidian-Live-CoEdit?style=flat&logo=github&label=Stars)](https://github.com/kebl3541/Obsidian-Live-CoEdit/stargazers)
[![Latest release](https://img.shields.io/github/v/release/kebl3541/Obsidian-Live-CoEdit?style=flat&label=Release)](https://github.com/kebl3541/Obsidian-Live-CoEdit/releases/latest)

Co-edit the **same open note simultaneously** with an external collaborator —
an AI assistant (Claude Code, etc.), a script, or another editor — without
anyone's words getting lost.

If you enjoy using this plugin, don't forget to ⭐ star the repository to show
your support!

<a href="https://buymeacoffee.com/philosophizer"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-orange.png" alt="Buy me a coffee" height="42"></a>

## The problem it solves

Obsidian autosaves your typing every couple of seconds. If something else
writes to the same file on disk at the same time, one side normally wins and
the other side's edit disappears.

Live Co-Edit keeps a shadow copy of every open markdown file. When the file
changes on disk while you're editing it, the plugin **three-way merges** the
external change into your editor:

- Edits to **different parts** of the note merge silently — your cursor stays
  exactly where it was.
- Edits to the **same lines** keep **your** version, and a notice tells you a
  conflict was resolved.
- When you're idle, external changes just flow in.

## Using it with an AI assistant

1. Open a note in Obsidian.
2. Ask your assistant (e.g. Claude Code pointed at your vault) to edit the
   same file.
3. Watch its changes appear in your editor while you keep typing.

The status bar shows the last merge (`Co-edit: merged external edit at …`).

## Commands

- **Re-sync active file from disk** — escape hatch: discard the plugin's local
  state for this file and reload the disk version.

## Limits, honestly

- Merging is line-based: two people editing the *same line* at the same moment
  is a conflict (your side wins) rather than a character-level merge.
- There is a small race window (~2 s) where Obsidian's autosave can land
  between an external write and the merge; external tools should re-read the
  file after writing if they need certainty.
- Files over 2 MB are left to Obsidian's default behavior.

## Install (manual)

1. `npm install && npm run build`
2. Copy `main.js` and `manifest.json` into
   `<YourVault>/.obsidian/plugins/live-coedit/`
3. Enable **Live Co-Edit** under Settings → Community plugins.

## Support

If this plugin is useful to you, you can support its development:

<a href="https://buymeacoffee.com/philosophizer"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-orange.png" alt="Buy me a coffee" height="42"></a>
<a href="https://www.paypal.com/donate/?business=berlin.philosophy%40gmail.com&no_recurring=0&currency_code=EUR"><img src="https://img.shields.io/badge/PayPal-Donate-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate via PayPal" height="42"></a>

## License

MIT
