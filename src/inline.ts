// In-document track changes: renders a pending proposal inside the editor.
// Buttons carry data attributes and are handled by a document-level capture
// listener in the plugin, immune to editor event layers and stale closures.

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";

export interface InlineAdd {
  pos: number;
  text: string;
  proposalIndex: number;
}

export interface InlineDel {
  from: number;
  to: number;
  proposalIndex: number;
}

export interface InlineProposalSpec {
  path: string;
  dels: InlineDel[];
  adds: InlineAdd[];
}

export const setInlineProposals = StateEffect.define<InlineProposalSpec>();
export const clearInlineProposals = StateEffect.define<null>();

class AddWidget extends WidgetType {
  constructor(
    private text: string,
    private proposalIndex: number,
    private path: string
  ) {
    super();
  }

  eq(other: AddWidget): boolean {
    return (
      other.text === this.text &&
      other.proposalIndex === this.proposalIndex &&
      other.path === this.path
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const doc = view.dom.ownerDocument;
    const span = doc.createElement("span");
    span.className = "live-coedit-ghost";
    span.dataset.path = this.path;
    span.dataset.index = String(this.proposalIndex);
    if (this.text.length > 0) {
      const txt = doc.createElement("span");
      txt.className = "live-coedit-ghost-text";
      txt.textContent = this.text;
      span.appendChild(txt);
    }
    const mk = (label: string, cls: string, accept: boolean) => {
      const b = doc.createElement("button");
      b.className = `live-coedit-ghost-btn ${cls}`;
      b.textContent = label;
      b.title = accept ? "Accept this change" : "Reject this change";
      b.dataset.accept = accept ? "1" : "0";
      span.appendChild(b);
    };
    mk("✓", "live-coedit-ghost-yes", true);
    mk("✕", "live-coedit-ghost-no", false);
    return span;
  }

  ignoreEvent(): boolean {
    return true; // the plugin's capture listener handles clicks
  }
}

const delMark = Decoration.mark({
  class: "live-coedit-prop-del",
  attributes: { title: "Proposed deletion" },
});

export const inlineProposalsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setInlineProposals)) {
        const spec = e.value;
        const ranges = [];
        for (const d of spec.dels) {
          if (d.to > d.from) ranges.push(delMark.range(d.from, d.to));
        }
        for (const a of spec.adds) {
          ranges.push(
            Decoration.widget({
              widget: new AddWidget(a.text, a.proposalIndex, spec.path),
              side: 1,
            }).range(a.pos)
          );
        }
        ranges.sort((x, y) => x.from - y.from || x.to - y.to);
        deco = Decoration.set(ranges, true);
      } else if (e.is(clearInlineProposals)) {
        deco = Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
