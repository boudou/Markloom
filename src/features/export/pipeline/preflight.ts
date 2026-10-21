// Checks a document before export, so problems surface in Markloom rather than in Word.
import { getMarkdownParser, mermaidFences } from '@/lib/markdown';
import { renderMermaid } from '@/features/mermaid/utils/mermaidConfig';
import { describeDiagramError } from '@/features/mermaid/utils/errors';
import { canResolveRelative, readFileBlob } from '@/features/file-tree/api/fileSystem';
import { resolveSourcePath, safeDecode } from '@/lib/documentPath';
import { placedInlines } from './inlineLines';

export interface ExportIssue {
  kind: 'diagram' | 'image';
  /** 1-based document line to jump to */
  line: number;
  message: string;
}

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

export async function checkDocument(markdown: string, docPath: string | null): Promise<ExportIssue[]> {
  const tokens = getMarkdownParser().parse(markdown, {});
  const checks: Promise<ExportIssue | null>[] = [];

  for (const { code, firstLine } of mermaidFences(tokens)) {
    checks.push(
      // The same render export uses, so a diagram checked here is cached for the export
      renderMermaid(code, 'export').then((result) => {
        if (result.ok) return null;
        const described = describeDiagramError(result.error, code, firstLine);
        // The list already shows the line number; drop it from the sentence
        const sentence = described.summary.replace(/^Line \d+:\s*/, '');

        return {
          kind: 'diagram',
          line: described.line ?? firstLine,
          message: sentence.charAt(0).toUpperCase() + sentence.slice(1),
        };
      })
    );
  }

  for (const { token, lines } of placedInlines(tokens)) {
    const line = lines[0] + 1;

    for (const child of token.children ?? []) {
      if (child.type !== 'image') continue;
      const src = child.attrGet('src') ?? '';

      if (!src || ABSOLUTE_URL.test(src)) continue;

      // markdown-it stores the source percent-encoded; show it as the user typed it
      const typed = safeDecode(src);

      if (!canResolveRelative(docPath)) {
        checks.push(
          Promise.resolve({
            kind: 'image',
            line,
            message: `“${typed}” can’t be included: open the document from its folder so Markloom can read it.`,
          })
        );
        continue;
      }

      checks.push(
        readFileBlob(resolveSourcePath(docPath, src)).then(
          () => null,
          () => ({ kind: 'image', line, message: `Image not found: ${typed}` })
        )
      );
    }
  }

  const issues = (await Promise.all(checks)).filter((issue): issue is ExportIssue => issue !== null);

  return issues.sort((a, b) => a.line - b.line);
}
