// CodeMirror decoration layers:
// 1. Collaborator-written text marks (per-collaborator color slot). Marks
//    survive further typing (they map through document changes) and stay
//    until explicitly cleared.
// 2. Highlighting of %%name: ...%% comments.

import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { COMMENT_RE } from "./comments";

export const SLOT_COUNT = 6;

export interface MarkRange {
  from: number;
  to: number;
}

export interface SlottedRange extends MarkRange {
  slot: number;
}

export const addExternalMarks = StateEffect.define<{
  ranges: MarkRange[];
  slot: number;
}>();
export const clearExternalMarks = StateEffect.define<null>();
export const removeMarkRange = StateEffect.define<MarkRange>();

const slotMarks: Decoration[] = [];
for (let i = 1; i <= SLOT_COUNT; i++) {
  slotMarks.push(
    Decoration.mark({
      class: `live-coedit-external live-coedit-slot${i}`,
      attributes: { title: "Changed by your collaborator" },
    })
  );
}

export function markForSlot(slot: number): Decoration {
  const idx = ((slot - 1) % SLOT_COUNT + SLOT_COUNT) % SLOT_COUNT;
  return slotMarks[idx];
}

export const externalMarksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(addExternalMarks)) {
        const mark = markForSlot(e.value.slot);
        deco = deco.update({
          add: e.value.ranges
            .filter((r) => r.to > r.from)
            .map((r) => mark.range(r.from, r.to)),
          sort: true,
        });
      } else if (e.is(clearExternalMarks)) {
        deco = Decoration.none;
      } else if (e.is(removeMarkRange)) {
        const target = e.value;
        deco = deco.update({
          filter: (from, to) => to <= target.from || from >= target.to,
        });
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Read the current collaborator marks (post-mapping) back out of a view, so
// they can be persisted across restarts.
export function readMarks(view: EditorView): SlottedRange[] {
  const out: SlottedRange[] = [];
  const deco = view.state.field(externalMarksField, false);
  if (!deco) return out;
  deco.between(0, view.state.doc.length, (from, to, value) => {
    const cls = (value.spec as { class?: string }).class ?? "";
    const m = cls.match(/live-coedit-slot(\d+)/);
    out.push({ from, to, slot: m ? parseInt(m[1], 10) : 1 });
  });
  return out;
}

// ---- Comment highlighting ---------------------------------------------------

const commentDecorator = new MatchDecorator({
  regexp: new RegExp(COMMENT_RE.source, "g"),
  decoration: Decoration.mark({ class: "live-coedit-comment" }),
});

export const commentHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = commentDecorator.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = commentDecorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations }
);
