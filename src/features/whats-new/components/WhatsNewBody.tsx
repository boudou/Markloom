import { useMemo } from 'react';
import changelog from '../../../../CHANGELOG.md?raw';
import { parseMarkdown } from '@/lib/markdown';
import { CHANGELOG_URL } from '@/lib/projectLinks';

/** The section under `## [version]`, without its heading; null when there is none or it is empty */
function releaseNotes(text: string, version: string): string | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));

  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => line.startsWith('## '));
  const notes = (next === -1 ? rest : rest.slice(0, next)).join('\n').trim();

  return notes || null;
}

/** Sanitized HTML whose links open outside the app: a new browser tab, or the system browser on desktop */
function renderNotes(notes: string): string {
  const template = document.createElement('template');
  template.innerHTML = parseMarkdown(notes);

  for (const link of template.content.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  return template.innerHTML;
}

export default function WhatsNewBody() {
  const html = useMemo(() => {
    const notes = releaseNotes(changelog, __APP_VERSION__);

    return notes === null ? null : renderNotes(notes);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {html === null ? (
        <p className="text-sm text-text-secondary">There are no notes for Markloom {__APP_VERSION__} yet.</p>
      ) : (
        <div
          role="region"
          aria-label="Release notes"
          tabIndex={0}
          className="max-h-[60vh] overflow-y-auto rounded-lg border border-rule bg-canvas px-6 py-5 prose-markloom font-editor text-sm *:first:mt-0 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-primary"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      <a
        href={CHANGELOG_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start text-xs text-text-secondary hover:text-accent-hover hover:underline underline-offset-2 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-primary rounded-xs"
      >
        Full changelog
      </a>
    </div>
  );
}
