// CodeMirror decoration layer that marks text written by the external
// collaborator. Marks survive further typing (they map through document
// changes) and stay until explicitly cleared.

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

export interface MarkRange {
  from: number;
  to: number;
}

export const addExternalMarks = StateEffect.define<MarkRange[]>();
export const clearExternalMarks = StateEffect.define<null>();

const externalMark = Decoration.mark({
  class: "live-coedit-external",
  attributes: { title: "Changed by your collaborator" },
});

export const externalMarksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(addExternalMarks)) {
        deco = deco.update({
          add: e.value
            .filter((r) => r.to > r.from)
            .map((r) => externalMark.range(r.from, r.to)),
          sort: true,
        });
      } else if (e.is(clearExternalMarks)) {
        deco = Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
