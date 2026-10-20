// GitHub-style callouts: a quote whose first line is "[!NOTE]", "[!TIP]", "[!IMPORTANT]",
// "[!WARNING]" or "[!CAUTION]". Shared by the Markdown renderer and the Word exporter.

export const CALLOUT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/** The marker line, alone on the quote's first line (GitHub's rule) */
export const CALLOUT_MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

/** Text colours; each meets WCAG AA on white and on the panel tint behind a callout */
export const CALLOUT_COLORS: Record<CalloutKind, string> = {
  note: '0969DA',
  tip: '1A7F37',
  important: '8250DF',
  warning: '9A6700',
  caution: 'CF222E',
};

// Lucide icons (info, lightbulb, message-square-warning, triangle-alert, octagon-alert)
const ICON_PATHS: Record<CalloutKind, string[]> = {
  note: ['M12 16v-4', 'M12 8h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  tip: [
    'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    'M9 18h6',
    'M10 22h4',
  ],
  important: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 'M12 7v2', 'M12 13h.01'],
  warning: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  caution: [
    'M12 16h.01',
    'M12 8v4',
    'M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z',
  ],
};

/** The title row shown at the top of a callout (icon + label) */
export function calloutTitleHtml(kind: CalloutKind): string {
  const paths = ICON_PATHS[kind].map((d) => `<path d="${d}"></path>`).join('');
  const icon = `<svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return `<p class="callout-title">${icon}${CALLOUT_LABELS[kind]}</p>\n`;
}
