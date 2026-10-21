// Turns Mermaid's parser output into something a writer can act on.

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
  const detail = message.trim();
  const lineInDiagram = Number(detail.match(/(?:Parse|Lexical) error on line (\d+)/i)?.[1]) || null;
  const line = lineInDiagram && firstLine ? firstLine + lineInDiagram - 1 : lineInDiagram;
  const where = line ? `Line ${line}` : 'This diagram';

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

/** Error card shared by the preview and the rich-text editor (DOM, no innerHTML). */
export function diagramErrorElement(error: DiagramError, onShowLine?: (line: number) => void): HTMLElement {
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
