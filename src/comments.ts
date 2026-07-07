// Collaborator comments embedded in notes as Obsidian comment syntax with a
// speaker prefix: %%name: text%%. Rendered specially in the editor and listed
// in the co-edit panel, where they can be replied to or dismissed.

export interface CoComment {
  name: string;
  text: string;
  from: number; // char offset of the opening %%
  to: number; // char offset just past the closing %%
  line: number; // 0-based line of the opening %%
}

export const COMMENT_RE = /%%\s*([A-Za-z0-9_-]+)\s*:\s*([\s\S]*?)%%/g;

export function scanComments(content: string): CoComment[] {
  const out: CoComment[] = [];
  COMMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMMENT_RE.exec(content)) !== null) {
    let line = 0;
    for (let i = 0; i < m.index; i++) {
      if (content.charCodeAt(i) === 10) line++;
    }
    out.push({
      name: m[1],
      text: m[2].trim(),
      from: m.index,
      to: m.index + m[0].length,
      line,
    });
  }
  return out;
}
