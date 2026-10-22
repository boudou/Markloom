// Turns Mermaid's parser output into something a writer can act on.
import type { DiagramRender } from './mermaidConfig';

export interface DiagramError {
  /** One plain sentence */
  summary: string;
  /** 1-based line in the document (or in the diagram when the document line is unknown) */
  line: number | null;
  /** The original message, for the curious */
  detail: string;
}

/**
 * @param message Mermaid's error text
 * @param code The diagram source
 * @param firstLine Document line of the diagram's first line, when known
 */
export function describeDiagramError(message: string, code: string, firstLine?: number): DiagramError {
  const reportedLine = /((?:Parse|Lexical) error on line )(\d+)/i;
  const original = message.trim();
  const reported = Number(original.match(reportedLine)?.[2]) || null;
  // End-of-input errors are reported on the line after the diagram; the statement left
  // unfinished is on its last line
  const lastLine = code.trimEnd().split('\n').length;
  const lineInDiagram = reported && Math.min(reported, lastLine);
  const line = lineInDiagram && firstLine ? firstLine + lineInDiagram - 1 : lineInDiagram;
  const where = line ? `Line ${line}` : 'This diagram';

  // Mermaid counts from the top of the diagram; show the same line as the summary
  const detail = line
    ? original.replace(
        reportedLine,
        (_, prefix: string) => `${prefix}${line}${firstLine ? ` (line ${lineInDiagram} of the diagram)` : ''}`
      )
    : original;

  if (/No diagram type detected/i.test(detail)) {
    return {
      summary: 'Unknown diagram type. The first line should name one, such as “flowchart TD” or “sequenceDiagram”.',
      line: firstLine ?? null,
      detail,
    };
  }

  if (lineInDiagram) {
    const source = code.split('\n')[lineInDiagram - 1]?.trim();
    const endsEarly = /got 'EOF'/.test(detail);

    const problem = endsEarly
      ? 'the diagram ends before this statement is finished'
      : source
        ? // Parsers notice a problem where they get stuck, which is often just after the mistake
          `the diagram stops making sense at “${source.length > 60 ? `${source.slice(0, 57)}…` : source}”. Check this line and the one above it`
        : 'the diagram stops making sense here. Check this line and the one above it';

    return { summary: `${where}: ${problem}.`, line, detail };
  }

  const firstSentence = detail.split('\n')[0].replace(/\s+/g, ' ').slice(0, 160);

  return { summary: `${where} couldn’t be drawn: ${firstSentence}`, line, detail };
}

export interface FillDiagramOptions {
  /** Document line of the diagram's first line, when known */
  firstLine?: number;
  /** "Show line N" on the error card; receives the document line (DiagramError.line) */
  onShowLine?: (line: number) => void;
}

/**
 * Puts a render result into `target`: the SVG with role="img" and a label, or an error card
 * with neither (the card's button and details must stay reachable). Returns the error, if any.
 */
export function fillDiagram(
  target: HTMLElement,
  result: DiagramRender,
  code: string,
  options: FillDiagramOptions = {}
): DiagramError | null {
  if (result.ok) {
    target.innerHTML = result.svg;
    target.setAttribute('role', 'img');
    target.setAttribute('aria-label', `Diagram: ${code.split('\n')[0].trim()}`);

    return null;
  }

  const error = describeDiagramError(result.error, code, options.firstLine);
  target.removeAttribute('role');
  target.removeAttribute('aria-label');
  target.replaceChildren(diagramErrorElement(error, options.onShowLine));

  return error;
}

/** Error card for `fillDiagram` (DOM, no innerHTML). */
function diagramErrorElement(error: DiagramError, onShowLine?: (line: number) => void): HTMLElement {
  const box = document.createElement('div');
  box.className = 'mermaid-error';
  // Polite: a document full of broken diagrams shouldn't interrupt a screen reader on open
  box.setAttribute('role', 'status');

  const title = document.createElement('p');
  title.className = 'mermaid-error-title';
  title.textContent = 'Diagram error';
  const summary = document.createElement('p');
  summary.className = 'mermaid-error-summary';
  summary.textContent = error.summary;
  box.append(title, summary);

  const actions = document.createElement('div');
  actions.className = 'mermaid-error-actions';

  if (onShowLine && error.line) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Show line ${error.line}`;
    button.addEventListener('click', () => onShowLine(error.line!));
    actions.append(button);
  }

  const details = document.createElement('details');
  const label = document.createElement('summary');
  label.textContent = 'Details';
  const pre = document.createElement('pre');
  pre.textContent = error.detail;
  details.append(label, pre);
  actions.append(details);
  box.append(actions);

  return box;
}
