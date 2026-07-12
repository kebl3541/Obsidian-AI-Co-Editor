// Test bundle entry: the decoration StateFields plus the exact
// @codemirror/state instance they were built against.
export {
  externalMarksField,
  addExternalMarks,
  clearExternalMarks,
} from "../src/marks";
export { inlineProposalsField, setInlineProposals } from "../src/inline";
export { EditorState } from "@codemirror/state";
