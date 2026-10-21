import type { Change } from 'diff';

export type DiffRow = { kind: 'added' | 'removed' | 'same'; text: string } | { kind: 'gap'; hidden: number };

const CONTEXT_LINES = 3;

/** A change's lines; the empty string after a trailing newline is not a line. */
function linesOf(change: Change): string[] {
  const lines = change.value.split('\n');

  if (lines[lines.length - 1] === '') lines.pop();

  return lines;
}

function sameRows(lines: string[]): DiffRow[] {
  return lines.map((text) => ({ kind: 'same', text }));
}

/** An unchanged run with `hidden` lines left out of the middle (or one end) of it. */
function collapsed(head: string[], hidden: number, tail: string[]): DiffRow[] {
  return [...sameRows(head), { kind: 'gap', hidden }, ...sameRows(tail)];
}

/** Display rows for `diffLines` output: every changed line, and unchanged runs cut to `CONTEXT_LINES` around each change. */
export function toDiffRows(changes: Change[]): DiffRow[] {
  if (changes.length === 1 && !changes[0].added && !changes[0].removed) return [];

  return changes.flatMap((change, index): DiffRow[] => {
    const lines = linesOf(change);

    if (change.added || change.removed) {
      const kind = change.added ? 'added' : 'removed';

      return lines.map((text) => ({ kind, text }));
    }

    const isFirst = index === 0;
    const isLast = index === changes.length - 1;
    const keep = isFirst || isLast ? CONTEXT_LINES : CONTEXT_LINES * 2;
    const hidden = lines.length - keep;

    if (hidden <= 0) return sameRows(lines);

    if (isFirst) return collapsed([], hidden, lines.slice(-CONTEXT_LINES));

    if (isLast) return collapsed(lines.slice(0, CONTEXT_LINES), hidden, []);

    return collapsed(lines.slice(0, CONTEXT_LINES), hidden, lines.slice(-CONTEXT_LINES));
  });
}
