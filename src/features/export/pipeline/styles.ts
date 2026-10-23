// Typography for exported HTML and PDF: the preview's reading style, tuned for paper.
export const EXPORT_STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  background: #fff;
  color: #1A1A1A;
  font: 10.5pt/1.65 Literata, Georgia, 'Times New Roman', serif;
  font-variant-ligatures: common-ligatures;
}
main.document { max-width: 72ch; margin: 0 auto; padding: 2.5rem 1.5rem; }
@media print { main.document { max-width: none; padding: 0; } }

h1, h2, h3, h4, h5, h6 {
  font-family: Fraunces, Georgia, serif;
  font-weight: 600;
  line-height: 1.25;
  color: #1A1A1A;
  margin: 1.6em 0 0.5em;
  break-after: avoid;
  text-wrap: balance;
}
h1 { font-size: 2em; font-weight: 700; margin-top: 0; }
h2 { font-size: 1.45em; }
h3 { font-size: 1.2em; }
h4 { font-size: 1.05em; }
h5, h6 { font-size: 1em; color: #5A5A5A; }

p, ul, ol, blockquote, table, pre, figure { margin: 0 0 0.9em; }
p { orphans: 3; widows: 3; }
a { color: #1D4ED8; text-decoration-thickness: 1px; text-underline-offset: 2px; }
strong { font-weight: 700; }

ul, ol { padding-left: 1.5em; }
li { margin: 0.25em 0; }
li > ul, li > ol { margin: 0.25em 0 0; }
li.task-list-item { list-style: none; margin-left: -1.3em; }
.task-checkbox { width: 0.9em; height: 0.9em; margin: 0 0.45em 0 0; vertical-align: -0.1em; accent-color: #2563EB; }

blockquote {
  padding: 0.6em 1em;
  border-left: 2px solid #E9ECEF;
  background: #F8F9FA;
  color: #3F3F46;
  break-inside: avoid;
}
blockquote > :last-child { margin-bottom: 0; }
blockquote.callout { --callout: #0969DA; border-left: 3px solid var(--callout); background: color-mix(in srgb, var(--callout) 5%, #FFFFFF); }
blockquote.callout-tip { --callout: #1A7F37; }
blockquote.callout-important { --callout: #8250DF; }
blockquote.callout-warning { --callout: #9A6700; }
blockquote.callout-caution { --callout: #CF222E; }
.callout-title { display: flex; align-items: center; gap: 0.45em; margin: 0 0 0.35em; color: var(--callout); font-weight: 600; font-size: 0.92em; }
.callout-icon { width: 1.05em; height: 1.05em; flex-shrink: 0; }
.callout-title + * { margin-top: 0; }

sup.footnote-ref { font-size: 0.75em; line-height: 0; }
sup.footnote-ref a { padding: 0 0.1em; font-weight: 600; text-decoration: none; }
hr.footnotes-sep { margin: 2.5em 0 1em; }
section.footnotes { font-size: 0.88em; color: #3F3F46; }
section.footnotes li > p { margin: 0.25em 0; }
.footnote-item { break-inside: avoid; }
a.footnote-backref { text-decoration: none; }

code, pre, kbd { font-family: 'IBM Plex Mono', Consolas, monospace; }
:not(pre) > code {
  font-size: 0.88em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: #F1F3F5;
  color: #9F1239;
}
pre {
  padding: 0.9em 1em;
  border: 1px solid #E9ECEF;
  border-radius: 6px;
  background: #F8F9FA;
  font-size: 0.82em;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  break-inside: avoid;
}

table { width: 100%; border-collapse: collapse; font-size: 0.92em; break-inside: auto; }
th, td { border: 1px solid #E9ECEF; padding: 0.45em 0.7em; text-align: left; vertical-align: top; }
th { background: #F8F9FA; font-weight: 600; }
tr { break-inside: avoid; }

img { max-width: 100%; height: auto; }
hr { border: 0; border-top: 1px solid #E9ECEF; margin: 2em 0; }

figure.diagram {
  margin: 1.2em 0;
  padding: 1em;
  border: 1px solid #E9ECEF;
  border-radius: 8px;
  text-align: center;
  break-inside: avoid;
}
figure.diagram svg { max-width: 100%; height: auto; }

.math-display { margin: 0 0 0.9em; text-align: center; overflow-x: auto; break-inside: avoid; }
.katex-error { color: #B91C1C; }

.export-error {
  margin: 0 0 0.9em;
  padding: 0.75em 1em;
  border: 1px solid #FECACA;
  border-radius: 6px;
  background: #FEF2F2;
  color: #991B1B;
  font: 0.85em/1.5 'IBM Plex Mono', Consolas, monospace;
}
.export-error pre { margin: 0.3em 0 0; padding: 0; border: 0; background: none; white-space: pre-wrap; }

/* Code highlighting (same palette as the preview) */
.hljs-comment, .hljs-quote { color: #6A737D; font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: #7C3AED; }
.hljs-string, .hljs-regexp, .hljs-addition { color: #15803D; }
.hljs-number, .hljs-symbol, .hljs-bullet { color: #B45309; }
.hljs-title, .hljs-section, .hljs-name, .hljs-title.function_ { color: #1D4ED8; }
.hljs-attr, .hljs-attribute, .hljs-variable, .hljs-type, .hljs-built_in { color: #0E7490; }
.hljs-deletion { color: #B91C1C; }
.hljs-meta { color: #626977; }
`;

// Pages laid out by `pages.ts`; the page's size and padding come from `pageGeometry.ts` (`html.ts`)
export const PAGED_STYLES = `
html, body { background: #fff; }
.page { position: relative; overflow: hidden; background: #fff; }
.page:not(:last-child) { break-after: page; }
.page > :first-child { margin-top: 0; }
.page-fit > * { margin: 0; }

/* Blocks cut across pages (splitBlocks.ts); the measuring document uses these rules too */
pre[data-continues] { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
pre[data-continued] { margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; }
li[data-continued] { list-style: none; margin-top: 0; }
li.task-list-item[data-continued] { padding-left: 1.35em; }
`;
