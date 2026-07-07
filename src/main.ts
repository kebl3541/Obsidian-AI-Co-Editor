import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
} from "obsidian";
import { merge3 } from "./merge";

// Live Co-Edit keeps a shadow copy of every open markdown file. When the file
// changes on disk while it is open (an AI assistant, script, or other editor
// wrote to it), the external change is three-way merged into the editor
// instead of replacing it — the user's un-saved typing survives, and so does
// the external edit.

const MAX_FILE_SIZE = 2_000_000; // bytes; larger files are left to Obsidian

export default class LiveCoEditPlugin extends Plugin {
  // Last content both the editor and the disk agreed on, per file path.
  private shadows = new Map<string, string>();
  private statusEl: HTMLElement | null = null;

  onload() {
    this.statusEl = this.addStatusBarItem();
    this.setStatus("ready");

    this.registerEvent(
      this.app.vault.on("modify", (f) => void this.onDiskChange(f))
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (f) => {
        if (f) void this.captureShadow(f);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        const shadow = this.shadows.get(oldPath);
        if (shadow !== undefined) {
          this.shadows.delete(oldPath);
          this.shadows.set(f.path, shadow);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => this.shadows.delete(f.path))
    );

    this.addCommand({
      id: "resync-active-file",
      name: "Re-sync active file from disk",
      callback: () => void this.resyncActive(),
    });

    this.app.workspace.onLayoutReady(() => {
      const f = this.app.workspace.getActiveFile();
      if (f) void this.captureShadow(f);
    });
  }

  onunload() {
    this.shadows.clear();
  }

  private setStatus(text: string) {
    this.statusEl?.setText(`Co-edit: ${text}`);
  }

  private async captureShadow(file: TFile) {
    if (file.extension !== "md" || file.stat.size > MAX_FILE_SIZE) return;
    if (!this.shadows.has(file.path)) {
      this.shadows.set(file.path, await this.app.vault.cachedRead(file));
    }
  }

  private findEditorFor(path: string): Editor | null {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === path) {
        return view.editor;
      }
    }
    return null;
  }

  // The heart of the plugin: the file changed on disk. Decide whether that
  // was Obsidian's own save (no-op) or an external edit (merge).
  private async onDiskChange(af: TAbstractFile) {
    if (!(af instanceof TFile) || af.extension !== "md") return;
    if (af.stat.size > MAX_FILE_SIZE) return;

    const disk = await this.app.vault.cachedRead(af);
    const editor = this.findEditorFor(af.path);

    if (!editor) {
      // Not open anywhere: just remember the new agreed content.
      this.shadows.set(af.path, disk);
      return;
    }

    const buffer = editor.getValue();
    if (buffer === disk) {
      // Obsidian's own autosave (or identical content) — nothing to merge.
      this.shadows.set(af.path, disk);
      return;
    }

    const base = this.shadows.get(af.path) ?? buffer;

    let merged: string;
    let conflicts = 0;
    if (buffer === base) {
      // No local unsaved changes: take the external edit as-is.
      merged = disk;
    } else {
      const result = merge3(base, buffer, disk);
      merged = result.merged;
      conflicts = result.conflicts;
    }

    this.applyMinimalEdit(editor, merged);
    this.shadows.set(af.path, merged);

    const time = new Date().toLocaleTimeString();
    if (conflicts > 0) {
      this.setStatus(`merged with ${conflicts} conflict(s) at ${time} — kept your text`);
      new Notice(
        `Live Co-Edit: ${conflicts} overlapping edit(s) — your version was kept.`
      );
    } else {
      this.setStatus(`merged external edit at ${time}`);
    }
  }

  // Replace only the changed region so the cursor and scroll position keep
  // their place through CodeMirror's position mapping.
  private applyMinimalEdit(editor: Editor, next: string) {
    const cur = editor.getValue();
    if (cur === next) return;

    let prefix = 0;
    const minLen = Math.min(cur.length, next.length);
    while (prefix < minLen && cur.charCodeAt(prefix) === next.charCodeAt(prefix)) {
      prefix++;
    }
    let suffix = 0;
    while (
      suffix < minLen - prefix &&
      cur.charCodeAt(cur.length - 1 - suffix) ===
        next.charCodeAt(next.length - 1 - suffix)
    ) {
      suffix++;
    }

    editor.replaceRange(
      next.slice(prefix, next.length - suffix),
      editor.offsetToPos(prefix),
      editor.offsetToPos(cur.length - suffix)
    );
  }

  // Manual escape hatch: throw away local state and reload from disk.
  private async resyncActive() {
    const file = this.app.workspace.getActiveFile();
    const editor = file ? this.findEditorFor(file.path) : null;
    if (!file || !editor) {
      new Notice("Open a markdown file first.");
      return;
    }
    const disk = await this.app.vault.cachedRead(file);
    this.applyMinimalEdit(editor, disk);
    this.shadows.set(file.path, disk);
    this.setStatus("re-synced from disk");
  }
}
