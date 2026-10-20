// Checks a document before export, so problems surface in Markloom rather than in Word.
import { getMarkdownParser } from '@/lib/markdown';
import { diagramSyntaxError } from '@/features/mermaid/utils/mermaidConfig';
import { describeDiagramError } from '@/features/mermaid/utils/errors';
import { readFileBlob } from '@/features/file-tree/api/fileSystem';
import { resolveRelativePath } from '@/features/editor/hooks/useDocumentLinks';

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

  for (const token of tokens) {
    if (token.type === 'fence' && token.map && token.info.trim().split(/\s+/)[0] === 'mermaid') {
      const code = token.content.trim();
      const blankLines = (token.content.match(/^(?:[ \t]*\n)*/)?.[0].match(/\n/g) ?? []).length;
      const firstLine = token.map[0] + 2 + blankLines;
      checks.push(
        diagramSyntaxError(code).then((message) => {
          if (!message) return null;
          const described = describeDiagramError(message, code, firstLine);
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

    if (token.type !== 'inline' || !token.map) continue;
    const line = token.map[0] + 1;
    for (const child of token.children ?? []) {
      if (child.type !== 'image') continue;
      const src = child.attrGet('src') ?? '';
      if (!src || ABSOLUTE_URL.test(src)) continue;
      if (!docPath || docPath.startsWith('file://')) {
        checks.push(
          Promise.resolve({
            kind: 'image',
            line,
            message: `“${src}” can’t be included: open the document from its folder so Markloom can read it.`,
          })
        );
        continue;
      }
      const path = resolveRelativePath(docPath, decodeURIComponent(src.split(/[?#]/)[0]));
      checks.push(
        readFileBlob(path).then(
          () => null,
          () => ({ kind: 'image', line, message: `Image not found: ${src}` })
        )
      );
    }
  }

  const issues = (await Promise.all(checks)).filter((issue): issue is ExportIssue => issue !== null);
  return issues.sort((a, b) => a.line - b.line);
}
