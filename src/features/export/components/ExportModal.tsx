import { useEffect, useState } from 'react';
import { m } from 'framer-motion';
import { FileDown, Loader2, FileType, FileText, Globe, FileCode2, AlertTriangle } from 'lucide-react';
import { Button, Input, Modal, ModalFooter } from '@/components/ui';
import { cn } from '@/lib/utils';
import { selectActiveTab, useActivePath, useTabsStore } from '@/features/tabs';
import { documentName } from '@/features/file-tree/api/fileSystem';
import { notify } from '@/stores/uiStore';
import { useAppStore } from '@/stores/appStore';
import type { ExportIssue } from '../pipeline/preflight';

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = 'docx' | 'pdf' | 'html' | 'md';

const isDesktop = !!window.markloomDesktop?.printToPdf;

const FORMATS: { id: ExportFormat; label: string; icon: typeof FileText; description: string }[] = [
  {
    id: 'docx',
    label: 'Word',
    icon: FileType,
    description: 'Editable .docx with headings, lists, tables, code, images and diagrams.',
  },
  {
    id: 'pdf',
    label: 'PDF',
    icon: FileText,
    description: isDesktop
      ? 'Print-quality PDF with selectable text and sharp diagrams.'
      : 'Opens the print dialog; choose “Save as PDF”.',
  },
  {
    id: 'html',
    label: 'Web page',
    icon: Globe,
    description: 'A single .html file with fonts, images and diagrams built in.',
  },
  {
    id: 'md',
    label: 'Markdown',
    icon: FileCode2,
    description: 'One portable .md file: images and diagrams embedded, no folders needed.',
  },
];

// Every label the export button can show shares one grid cell, so the button keeps its
// width while the label crossfades (after interior.dev's loading button)
const FACE_SWAP = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const BUTTON_FACES = [
  ...FORMATS.map((f) => ({ key: f.id as string, text: `Export ${f.label}`, busy: false })),
  { key: 'exporting', text: 'Exporting…', busy: true },
];

function ExportButtonLabel({ active }: { active: string }) {
  return (
    <span className="grid">
      {BUTTON_FACES.map((face) => {
        const shown = face.key === active;
        return (
          <m.span
            key={face.key}
            aria-hidden={!shown}
            initial={false}
            animate={shown ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 3, filter: 'blur(3px)' }}
            transition={FACE_SWAP}
            className="col-start-1 row-start-1 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {face.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {face.text}
          </m.span>
        );
      })}
    </span>
  );
}

// Markdown emphasis and characters Windows/macOS reject in file names
function toFileName(title: string): string {
  return (
    title
      .replace(/[*_`~]/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Untitled document'
  );
}

// The dialog stays mounted: read the text when it's needed rather than re-rendering on every keystroke
const readContent = () => selectActiveTab(useTabsStore.getState())?.content ?? '';

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const hasContent = useTabsStore((s) => /\S/.test(selectActiveTab(s)?.content ?? ''));
  const docPath = useActivePath();

  const [format, setFormat] = useState<ExportFormat>('docx');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ExportIssue[]>([]);

  // Suggest a title each time the dialog opens: the first heading, else the file name
  useEffect(() => {
    if (!open) return;
    const content = readContent();
    const heading = content.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1];
    const fileName = docPath ? documentName(docPath).replace(/\.(md|markdown|mdx)$/i, '') : null;
    setTitle(toFileName(heading ?? fileName ?? 'Untitled document'));
    setError(null);
    setIssues([]);
    // Check for problems that would otherwise only show up in the exported file
    let cancelled = false;
    void import('../pipeline/preflight')
      .then(({ checkDocument }) => checkDocument(content, docPath))
      .then((found) => !cancelled && setIssues(found))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only when opening; editing the field shouldn't be overwritten while typing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    const request = { markdown: readContent(), docPath, title: toFileName(title), author: author.trim() || undefined };

    try {
      // Exporters pull in large libraries; load them only when used
      if (format === 'docx') {
        const { exportDocx } = await import('../pipeline/docx');
        await exportDocx(request);
      } else {
        const exporters = await import('../pipeline/exporters');
        if (format === 'pdf') {
          const outcome = await exporters.exportPdf(request);
          if (outcome === 'print-dialog') {
            onOpenChange(false);
            return;
          }
        } else if (format === 'html') {
          await exporters.exportHtml(request);
        } else {
          await exporters.exportMarkdown(request);
        }
      }
      onOpenChange(false);
      notify({ tone: 'success', title: `Exported “${request.title}”` });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const current = FORMATS.find((f) => f.id === format)!;
  // Problems are shown on their source line, which lives in the Markdown view
  const inRichText = useAppStore((s) => s.editorMode) === 'wysiwyg';

  // Jump to the problem in the Markdown view, where the line is visible and marked
  const review = (issue: ExportIssue) => {
    onOpenChange(false);
    useAppStore.getState().setEditorMode('split');
    window.setTimeout(
      () => window.dispatchEvent(new CustomEvent('outline-navigate', { detail: { line: issue.line } })),
      250
    );
  };
  const diagramCount = issues.filter((i) => i.kind === 'diagram').length;
  const imageCount = issues.length - diagramCount;
  const issueSummary = [
    diagramCount && `${diagramCount} ${diagramCount === 1 ? 'diagram has an error' : 'diagrams have errors'}`,
    imageCount && `${imageCount} ${imageCount === 1 ? 'image is missing' : 'images are missing'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal open={open} onOpenChange={(next) => !exporting && onOpenChange(next)} title="Export" size="lg">
      <div className="space-y-5">
        <div role="radiogroup" aria-label="Format" className="grid grid-cols-4 gap-2">
          {FORMATS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={format === id}
              onClick={() => setFormat(id)}
              className={cn(
                'flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium',
                'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
                format === id
                  ? 'border-accent-primary bg-accent-muted/60 text-accent-hover'
                  : 'border-rule text-text-secondary hover:border-text-muted hover:text-text-primary'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-sm text-text-secondary">{current.description}</p>

        <label className="block text-sm">
          <span className="text-text-secondary">File name</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5" data-autofocus />
        </label>

        {format === 'docx' && (
          <label className="block text-sm">
            <span className="text-text-secondary">Author (optional)</span>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} className="mt-1.5" />
          </label>
        )}

        {issues.length > 0 && (
          <div className="rounded-lg border border-[#FCD34D] bg-[#FFFBEB] p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-[#92400E]">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />
              {issueSummary}
            </p>
            <ul className="mt-2 space-y-1.5">
              {issues.slice(0, 4).map((issue) => (
                <li key={`${issue.kind}-${issue.line}-${issue.message}`} className="flex items-start gap-3">
                  <span className="flex-1 min-w-0 text-[#78350F]">
                    <span className="tabular-nums font-medium">Line {issue.line}</span> · {issue.message}
                  </span>
                  <button
                    type="button"
                    onClick={() => review(issue)}
                    className="flex-shrink-0 text-xs font-medium text-[#92400E] underline underline-offset-2 hover:text-[#78350F]"
                  >
                    {inRichText ? 'Show in Markdown' : 'Show'}
                  </button>
                </li>
              ))}
            </ul>
            {issues.length > 4 && <p className="mt-1.5 text-xs text-[#92400E]">and {issues.length - 4} more</p>}
            <p className="mt-2 text-xs text-[#92400E]">You can still export; these parts will appear as error notes.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-[#B91C1C]">
            Export failed: {error}
          </p>
        )}
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={exporting}>
          Cancel
        </Button>
        <Button onClick={() => void handleExport()} disabled={exporting || !hasContent} aria-busy={exporting || undefined}>
          <ExportButtonLabel active={exporting ? 'exporting' : format} />
        </Button>
      </ModalFooter>
    </Modal>
  );
}
