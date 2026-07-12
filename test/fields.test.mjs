// Regression tests for the decoration StateFields: stale or out-of-range
// positions must never abort an editor transaction (that silently cancels
// every other plugin's edits in the same dispatch). See the RangeError bug
// fixed in 2.19.2.

// @codemirror/view may touch DOM globals at import time under Node.
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    documentElement: { style: {} },
  };
}

const {
  EditorState,
  externalMarksField,
  addExternalMarks,
  inlineProposalsField,
  setInlineProposals,
} = await import("./fields.build.mjs");

let checks = 0;
let failures = 0;
const ok = (cond, name) => {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL ${name}`);
  }
};
const decoCount = (state, field) => {
  let n = 0;
  state.field(field).between(0, state.doc.length, () => {
    n++;
  });
  return n;
};

// 1. THE regression: marks beyond the document (persisted from a longer
//    version of the note) followed by a whole-document shrink. Unfixed, the
//    shrink threw "RangeError: Position N is out of range".
{
  let state = EditorState.create({
    doc: "hello world",
    extensions: [externalMarksField],
  });
  state = state.update({
    effects: addExternalMarks.of({ ranges: [{ from: 20, to: 30 }], slot: 1 }),
  }).state;
  let threw = false;
  let after = state;
  try {
    after = state.update({
      changes: { from: 0, to: state.doc.length, insert: "hi" },
    }).state;
  } catch {
    threw = true;
  }
  ok(!threw, "whole-doc shrink survives fully out-of-range marks");
  ok(after.doc.toString() === "hi", "the edit itself lands");
}

// 2. Partially out-of-range marks are clamped to the document, not dropped.
{
  let state = EditorState.create({
    doc: "hello world",
    extensions: [externalMarksField],
  });
  state = state.update({
    effects: addExternalMarks.of({ ranges: [{ from: 6, to: 30 }], slot: 2 }),
  }).state;
  ok(decoCount(state, externalMarksField) === 1, "clamped mark survives");
  let threw = false;
  try {
    state = state.update({
      changes: { from: 0, to: state.doc.length, insert: "x" },
    }).state;
  } catch {
    threw = true;
  }
  ok(!threw, "shrink after clamped mark is safe");
}

// 3. Inline proposals with stale positions: same discipline.
{
  let state = EditorState.create({
    doc: "short doc",
    extensions: [inlineProposalsField],
  });
  state = state.update({
    effects: setInlineProposals.of({
      path: "x.md",
      dels: [{ from: 50, to: 60, proposalIndex: 0 }],
      adds: [{ pos: 99, text: "ghost", proposalIndex: 0 }],
    }),
  }).state;
  let threw = false;
  try {
    state = state.update({
      changes: { from: 0, to: state.doc.length, insert: "s" },
    }).state;
  } catch {
    threw = true;
  }
  ok(!threw, "inline proposals with stale positions never abort an edit");
}

// 4. Normal in-range behavior is unchanged: marks map through edits.
{
  let state = EditorState.create({
    doc: "abcdef",
    extensions: [externalMarksField],
  });
  state = state.update({
    effects: addExternalMarks.of({ ranges: [{ from: 2, to: 4 }], slot: 1 }),
  }).state;
  state = state.update({ changes: { from: 0, to: 0, insert: "xx" } }).state;
  let from = -1;
  state.field(externalMarksField).between(0, state.doc.length, (f) => {
    from = f;
  });
  ok(from === 4, "in-range mark maps through a prefix insertion");
}

if (failures > 0) {
  console.error(`${failures}/${checks} field checks failed`);
  process.exit(1);
}
console.log(`fields: ${checks} checks passed`);
