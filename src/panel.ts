import { ItemView, WorkspaceLeaf } from "obsidian";
import type LiveCoEditPlugin from "./main";

export const PANEL_VIEW_TYPE = "live-coedit-panel";

// Sidebar panel: pending proposals, collaborator changes in the active file,
// comments, snapshots, and recent activity.
export class CoEditPanelView extends ItemView {
  private plugin: LiveCoEditPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: LiveCoEditPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Co-edit";
  }

  getIcon(): string {
    return "users";
  }

  onOpen(): Promise<void> {
    void this.refresh();
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => void this.refresh())
    );
    return Promise.resolve();
  }

  async refresh(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    el.addClass("live-coedit-panel");

    const file = this.app.workspace.getActiveFile();

    // --- Pending proposals ---------------------------------------------------
    const pendingPaths = this.plugin.pendingPaths();
    const s1 = this.section(el, "Pending proposals");
    if (pendingPaths.length === 0) {
      s1.createDiv({ cls: "live-coedit-empty", text: "None" });
    }
    for (const path of pendingPaths) {
      const row = s1.createDiv({ cls: "live-coedit-row" });
      row.createSpan({ text: path });
      const btn = row.createEl("button", { text: "Review" });
      btn.addClass("mod-cta");
      btn.addEventListener("click", () => this.plugin.openReview(path));
    }

    // --- Collaborator changes in the active file ------------------------------
    const s2 = this.section(el, "Collaborator changes (active file)");
    const marks = file ? this.plugin.marksInFile(file.path) : [];
    if (marks.length === 0) {
      s2.createDiv({ cls: "live-coedit-empty", text: "None" });
    }
    for (const m of marks) {
      const row = s2.createDiv({ cls: "live-coedit-row live-coedit-clickable" });
      row.createSpan({
        cls: `live-coedit-chip live-coedit-slot${m.slot}`,
        text: m.name,
      });
      row.createSpan({ text: ` line ${m.line + 1}: ${m.excerpt}` });
      row.addEventListener("click", () => {
        if (file) this.plugin.jumpTo(file.path, m.from);
      });
    }
    if (marks.length > 0 && file) {
      const clear = s2.createEl("button", { text: "Clear all highlights" });
      clear.addEventListener("click", () => {
        this.plugin.clearHighlightsFor(file.path);
        void this.refresh();
      });
    }

    // --- Comments --------------------------------------------------------------
    const s3 = this.section(el, "Comments (active file)");
    const comments = file ? this.plugin.commentsInFile(file.path) : [];
    if (comments.length === 0) {
      s3.createDiv({ cls: "live-coedit-empty", text: "None" });
    }
    comments.forEach((c, idx) => {
      const row = s3.createDiv({ cls: "live-coedit-row" });
      const label = row.createDiv({ cls: "live-coedit-clickable" });
      label.createSpan({ cls: "live-coedit-chip", text: c.name });
      label.createSpan({ text: ` line ${c.line + 1}: ${c.text}` });
      label.addEventListener("click", () => {
        if (file) this.plugin.jumpTo(file.path, c.from);
      });
      const actions = row.createDiv();
      const reply = actions.createEl("button", { text: "Reply" });
      reply.addEventListener("click", () => {
        if (file) this.plugin.replyToComment(file.path, idx);
      });
      const dismiss = actions.createEl("button", { text: "Dismiss" });
      dismiss.addEventListener("click", () => {
        if (file) {
          void this.plugin
            .dismissComment(file.path, idx)
            .then(() => this.refresh());
        }
      });
    });

    // --- Snapshots --------------------------------------------------------------
    const s4 = this.section(el, "Snapshots (active file)");
    const snaps = file ? await this.plugin.snapshotList(file.path) : [];
    if (snaps.length === 0) {
      s4.createDiv({ cls: "live-coedit-empty", text: "None" });
    }
    for (const snap of snaps) {
      const row = s4.createDiv({ cls: "live-coedit-row" });
      row.createSpan({ text: new Date(snap.ts).toLocaleString() });
      const btn = row.createEl("button", { text: "Restore" });
      btn.addEventListener("click", () => {
        if (file) {
          void this.plugin.restoreSnapshot(file.path, snap).then(() => this.refresh());
        }
      });
    }

    // --- Recent activity ---------------------------------------------------------
    const s5 = this.section(el, "Recent activity");
    const recent = this.plugin.recentActivity();
    if (recent.length === 0) {
      s5.createDiv({ cls: "live-coedit-empty", text: "None yet" });
    }
    for (const entry of recent) {
      s5.createDiv({ cls: "live-coedit-activity", text: entry });
    }
  }

  private section(parent: HTMLElement, title: string): HTMLElement {
    const box = parent.createDiv({ cls: "live-coedit-section" });
    box.createEl("h5", { text: title });
    return box;
  }
}
