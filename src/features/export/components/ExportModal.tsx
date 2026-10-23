import { useEffect, useId, useState } from 'react';
import { m } from 'framer-motion';
import { FileDown, Loader2, FileType, FileText, Globe, FileCode2, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { Button, Input, Modal, ModalFooter } from '@/components/ui';
import { cn } from '@/lib/utils';
import { selectActiveContent, useActivePath, useTabsStore } from '@/features/tabs';
import { documentName } from '@/features/file-tree/api/fileSystem';
import { flushEditorEdits, notify, useUiStore } from '@/stores/uiStore';
import { useAppStore } from '@/stores/appStore';
import { selectExportOrientation, selectExportPageSize, useSettingsStore } from '@/stores/settingsStore';
import type { ExportIssue } from '../pipeline/preflight';
import type { Orientation, PageSetup, PageSize } from '../pipeline/pageGeometry';
import { PagePreview, type Preview } from './PagePreview';

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = 'docx' | 'pdf' | 'html' | 'md' | 'image';

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
      ? 'Print-quality PDF, page for page as previewed, with selectable text.'
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
  {
    id: 'image',
    label: 'Image',
    icon: ImageIcon,
    description: 'Each page as a PNG image, as it would print.',
  },
];

// Every label the export button can show shares one grid cell, so the button keeps its
// width while the label crossfades (after interior.dev's loading button)
const FACE_SWAP = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;

const BUTTON_FACES = [
  ...FORMATS.map((f) => ({ key: f.id, text: `Export ${f.label}`, busy: false })),
  { key: 'image-all', text: 'Save all pages', busy: false },
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
const readContent = () => {
  flushEditorEdits();

  return selectActiveContent(useTabsStore.getState());
};

const IDLE: Preview = { status: 'idle' };

const PAGE_SIZE_OPTIONS: readonly { value: PageSize; label: string }[] = [
  { value: 'A4', label: 'A4' },
  { value: 'Letter', label: 'Letter' },
];

const ORIENTATION_OPTIONS: readonly { value: Orientation; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

interface ChoiceGroupProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** A small labelled radiogroup, styled like the format choice */
function ChoiceGroup<T extends string>({ label, options, value, onChange }: ChoiceGroupProps<T>) {
  const labelId = useId();

  return (
    <div className="text-sm">
      <span id={labelId} className="text-text-secondary">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-1.5 grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'py-1.5 rounded-md border text-xs font-medium',
              'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-primary',
              value === option.value
                ? 'border-accent-primary bg-accent-muted/60 text-accent-hover'
                : 'border-rule text-text-secondary hover:border-text-muted hover:text-text-primary'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Formats that show the page preview and export its pages
const PAGED_FORMATS: ReadonlySet<ExportFormat> = new Set(['image', 'pdf']);

/**
 * Lays the current text out on pages the first time a paged format is shown in an opening,
 * and again when the page size or orientation changes, starting at page 1. Image and PDF
 * share the layout: the dialog is modal, so the text can't change until it closes.
 */
function usePagePreview(open: boolean, wanted: boolean, docPath: string | null, size: PageSize, orientation: Orientation) {
  const [preview, setPreview] = useState<Preview>(IDLE);
  const [page, setPage] = useState(0);
  const [enabled, setEnabled] = useState(false);

  // Adjusted while rendering: on once wanted in this opening, off when the dialog closes
  if (open && wanted && !enabled) setEnabled(true);

  if (!open && enabled) setEnabled(false);

  useEffect(() => {
    if (!enabled) {
      setPreview(IDLE);

      return;
    }

    // A layout still running for the previous setup is dropped when this one starts
    let cancelled = false;
    const setup: PageSetup = { size, orientation };
    setPreview({ status: 'loading' });
    setPage(0);

    // The layout code is a lazy chunk, loaded only for the preview
    void import('../pipeline/pages')
      .then(({ previewPages }) => previewPages({ markdown: readContent(), docPath, page: setup }))
      .then(({ doc, html }) => !cancelled && setPreview({ status: 'ready', doc, html }))
      .catch((err) => !cancelled && setPreview({ status: 'error', message: err instanceof Error ? err.message : String(err) }));

    return () => {
      cancelled = true;
    };
  }, [enabled, docPath, size, orientation]);

  return { preview, page, setPage };
}

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const hasContent = useTabsStore((s) => /\S/.test(selectActiveContent(s)));
  const docPath = useActivePath();

  const [format, setFormat] = useState<ExportFormat>('docx');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ExportIssue[]>([]);
  const showPages = PAGED_FORMATS.has(format);
  const pageSize = useSettingsStore(selectExportPageSize);
  const orientation = useSettingsStore(selectExportOrientation);
  const setPageSize = useSettingsStore((s) => s.setExportPageSize);
  const setOrientation = useSettingsStore((s) => s.setExportOrientation);
  const { preview, page, setPage } = usePagePreview(open, showPages, docPath, pageSize, orientation);

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

  const pagedDoc = preview.status === 'ready' ? preview.doc : null;
  const pageCount = pagedDoc?.pages.length ?? 0;
  // Image with several pages: Save this page beside Save all pages (a .zip); else one Export button
  const imagePages = format === 'image' && pageCount > 1;
  const primaryFace = imagePages ? 'image-all' : format;

  const handleExport = async (which: 'all' | number = 'all') => {
    setExporting(true);
    setError(null);
    const request = { markdown: readContent(), docPath, title: toFileName(title), author: author.trim() || undefined };

    try {
      // Exporters pull in large libraries; load them only when used
      if (format === 'image') {
        // The buttons are enabled only once the preview has laid the pages out
        if (!pagedDoc) return;

        const { savePages } = await import('../pipeline/pageImages');
        await savePages(pagedDoc, request.title, which);
      } else if (format === 'docx') {
        const { exportDocx } = await import('../pipeline/docx');
        await exportDocx(request);
      } else {
        const exporters = await import('../pipeline/exporters');

        if (format === 'pdf') {
          // The buttons are enabled only once the preview has laid the pages out; print those
          if (!pagedDoc) return;

          const outcome = await exporters.exportPdf(pagedDoc, request.title);

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
    const { activeTabId } = useTabsStore.getState();

    onOpenChange(false);
    useAppStore.getState().setEditorMode('split');

    if (activeTabId) useUiStore.getState().navigateToLine(activeTabId, issue.line);
  };

  const diagramCount = issues.filter((i) => i.kind === 'diagram').length;
  const imageCount = issues.filter((i) => i.kind === 'image').length;
  const mathCount = issues.filter((i) => i.kind === 'math').length;

  const issueSummary = [
    diagramCount && `${diagramCount} ${diagramCount === 1 ? 'diagram has an error' : 'diagrams have errors'}`,
    mathCount && `${mathCount} ${mathCount === 1 ? 'formula has an error' : 'formulas have errors'}`,
    imageCount && `${imageCount} ${imageCount === 1 ? 'image is missing' : 'images are missing'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !exporting && onOpenChange(next)}
      title="Export"
      size={showPages ? '3xl' : 'lg'}
    >
      <div className="space-y-5">
        <div role="radiogroup" aria-label="Format" className="grid grid-cols-5 gap-2">
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

        <div className={cn(showPages && 'grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-6')}>
          <div className="space-y-5 min-w-0">
            <label className="block text-sm">
              <span className="text-text-secondary">File name</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5" data-autofocus />
            </label>

            {showPages && (
              <div className="grid grid-cols-2 gap-3">
                <ChoiceGroup label="Page size" options={PAGE_SIZE_OPTIONS} value={pageSize} onChange={setPageSize} />
                <ChoiceGroup label="Orientation" options={ORIENTATION_OPTIONS} value={orientation} onChange={setOrientation} />
              </div>
            )}

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

          {showPages && (
            <PagePreview preview={preview} page={page} onPageChange={setPage} />
          )}
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={exporting}>
          Cancel
        </Button>
        {imagePages && (
          <Button variant="secondary" onClick={() => void handleExport(page)} disabled={exporting}>
            Save this page
          </Button>
        )}
        <Button
          onClick={() => void handleExport()}
          disabled={exporting || !hasContent || (showPages && pageCount === 0)}
          aria-busy={exporting || undefined}
        >
          <ExportButtonLabel active={exporting ? 'exporting' : primaryFace} />
        </Button>
      </ModalFooter>
    </Modal>
  );
}
