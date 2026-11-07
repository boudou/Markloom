// Assembles the website GitHub Pages serves, into _site/:
//   /              landing page (site/index.html)
//   /guides/<x>/   guides (site/guides/*.md)
//   /docs/<x>/     the user manual, rendered from a checkout of the wiki, which stays its source
//   /app/          the editor: dist/, built with --base=<site path>/app/
// Usage: npm run build -- --base=/Markloom/app/ && node scripts/build-site.mjs --wiki <wiki checkout>
// Set GOOGLE_SITE_VERIFICATION to add the Search Console tag. The build fails on a broken internal link.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import MarkdownIt from 'markdown-it';

const ROOT = join(import.meta.dirname, '..');
const SITE = join(ROOT, 'site');
const OUT = join(ROOT, '_site');
const SITE_URL = 'https://boudou.github.io/Markloom/';
const REPO_URL = 'https://github.com/boudou/Markloom';
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const FONTS = [
  'fraunces-latin-600-normal',
  'outfit-latin-400-normal',
  'outfit-latin-500-normal',
  'outfit-latin-600-normal',
  'literata-latin-400-normal',
  'literata-latin-400-italic',
  'literata-latin-600-normal',
  'ibm-plex-mono-latin-400-normal',
  'ibm-plex-mono-latin-600-normal',
];

const wikiFlag = process.argv.indexOf('--wiki');
const WIKI = wikiFlag > 0 ? resolve(process.argv[wikiFlag + 1]) : '';

if (!WIKI || !existsSync(join(WIKI, 'User-Manual.md'))) {
  console.error('Pass --wiki <dir>, a checkout of the Markloom wiki.');
  process.exit(1);
}

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error('dist/ is missing: run npm run build -- --base=/Markloom/app/ first.');
  process.exit(1);
}

if (!readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8').includes(`"${new URL(SITE_URL).pathname}app/assets/`)) {
  console.error('dist/ was not built for this site: run npm run build -- --base=/Markloom/app/ first.');
  process.exit(1);
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Heading ids the way GitHub makes them, so the wiki's own contents links keep working */
function headingIds(md) {
  md.core.ruler.push('heading_ids', (state) => {
    const seen = new Map();

    state.tokens.forEach((token, index) => {
      if (token.type !== 'heading_open') return;

      const text = state.tokens[index + 1].content.toLowerCase();
      const base = text.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
      const count = seen.get(base) ?? 0;

      seen.set(base, count + 1);
      token.attrSet('id', count ? `${base}-${count}` : base);
    });
  });
}

// No raw HTML: wiki pages end up on the editor's origin, so a script in one could read what the editor stores
const markdown = new MarkdownIt({ html: false, linkify: true }).use(headingIds);

/** `path` is the page's folder below the site root: '' for the landing page, 'guides/x/' for a guide */
function head({ title, description, path, noindex = false, rootPath }) {
  const root = rootPath ?? '../'.repeat(path.split('/').length - 1);
  const url = SITE_URL + path;
  const verification = process.env.GOOGLE_SITE_VERIFICATION;

  return [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${url}" />`,
    verification ? `<meta name="google-site-verification" content="${escapeHtml(verification)}" />` : '',
    '<meta name="color-scheme" content="light dark" />',
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F8F9FA" />',
    '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1E2024" />',
    `<link rel="icon" type="image/png" href="${root}markloom.png" />`,
    `<link rel="preload" href="${root}fonts/fraunces-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin />`,
    `<link rel="stylesheet" href="${root}site.css" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Markloom" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE_URL}og-image.png" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="Markloom: Markdown source beside the rendered page" />',
    '<meta name="twitter:card" content="summary_large_image" />',
  ]
    .filter(Boolean)
    .join('\n    ');
}

function header(root) {
  return `<header class="site-header">
      <a class="brand" href="${root || './'}"><img src="${root}markloom.png" alt="" width="28" height="28" />Markloom</a>
      <nav aria-label="Site">
        <a href="${root}docs/user-manual/">Manual</a>
        <a href="${root}#download">Download</a>
        <a href="${REPO_URL}">GitHub</a>
        <a class="button primary small" href="${root}app/">Open the editor</a>
      </nav>
    </header>`;
}

function footer(root) {
  return `<footer class="site-footer">
      <p>Markloom ${version}. MIT licence. Made by <a href="https://github.com/boudou">boudou</a>.</p>
      <nav aria-label="More">
        <a href="${root}app/">Editor</a>
        <a href="${root}docs/">Manual</a>
        <a href="${REPO_URL}/blob/main/CHANGELOG.md">Changelog</a>
        <a href="${REPO_URL}/blob/main/CONTRIBUTING.md">Contributing</a>
        <a href="${REPO_URL}">Source</a>
      </nav>
    </footer>`;
}

/** Expands {{shot name | alt}} and {{gif name | alt}}: a light and a dark image, picked by the visitor's theme */
function expandImages(html, root) {
  const picture = (file, extension, alt, width, height) => `<picture>
          <source srcset="${root}images/${file}-dark.${extension}" media="(prefers-color-scheme: dark)" />
          <img src="${root}images/${file}.${extension}" alt="${escapeHtml(alt)}" width="${width}" height="${height}" loading="lazy" decoding="async" />
        </picture>`;

  return html
    .replace(/\{\{shot ([\w-]+) \| ([^}]+)\}\}/g, (_, file, alt) => picture(file, 'png', alt, 2160, 1350))
    .replace(/\{\{gif ([\w-]+) \| ([^}]+)\}\}/g, (_, file, alt) => picture(file, 'gif', alt, 1000, 625));
}

function writePage(path, html) {
  const file = join(OUT, path, path.endsWith('.html') ? '' : 'index.html');

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

function articlePage({ title, description, path, body, aside = '' }) {
  const root = '../'.repeat(path.split('/').length - 1);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    ${head({ title: `${title} | Markloom`, description, path })}
  </head>
  <body>
    ${header(root)}
    <div class="article-layout">
      ${aside}
      <main class="prose">
${body}
      </main>
    </div>
    ${footer(root)}
  </body>
</html>
`;
}

function parseGuide(fileName) {
  const source = readFileSync(join(SITE, 'guides', fileName), 'utf8').replace(/\r\n?/g, '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);

  if (!match) throw new Error(`${fileName} has no front matter`);

  const fields = Object.fromEntries(match[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));

  return { ...fields, slug: fileName.replace(/\.md$/, ''), text: source.slice(match[0].length) };
}

/** The guides, with a way into the editor at the end of each */
function buildGuides() {
  const guides = readdirSync(join(SITE, 'guides')).filter((name) => name.endsWith('.md')).map(parseGuide);

  for (const guide of guides) {
    const path = `guides/${guide.slug}/`;
    const root = '../../';
    const body = expandImages(markdown.render(guide.text), root);
    const cta = `<aside class="guide-cta">
          <p><b>Try this on your own document.</b> Markloom is free and open source, and nothing to install.</p>
          <p><a class="button primary" href="${root}app/?sample">Try it in your browser</a> <a class="button" href="${root}#download">Download the desktop app</a></p>
        </aside>`;

    writePage(path, articlePage({ title: guide.title, description: guide.description, path, body: `${body}\n${cta}` }));
  }

  return guides;
}

/** A wiki page's link, on the website: wiki pages get their folder, links to this site become relative */
function rewriteWikiLinks(html, root, pageNames) {
  return html.replace(/\b(href|src|srcset)="([^"]+)"/g, (whole, attribute, target) => {
    if (target.startsWith(SITE_URL)) return `${attribute}="${root}${target.slice(SITE_URL.length)}"`;
    if (target.startsWith('images/')) return `${attribute}="${root}docs/${target}"`;

    const [name, hash] = target.split('#');

    if (!pageNames.has(name)) return whole;

    const folder = name === 'Home' ? '' : `${name.toLowerCase()}/`;

    return `${attribute}="${root}docs/${folder}${hash ? `#${hash}` : ''}"`;
  });
}

/** The wiki's themed images, as the macros that expandImages turns into pictures; markdown-it would escape the HTML */
function wikiPicturesToMacros(source) {
  const wikiPicture = /^<picture><source media="\(prefers-color-scheme: dark\)" srcset="images\/([\w-]+)-dark\.(png|gif)"><img src="images\/\1\.\2" alt="([^"{}]+)"><\/picture>$/gm;

  return source.replace(wikiPicture, (_, file, extension, alt) => `{{${extension === 'gif' ? 'gif' : 'shot'} ${file} | ${alt}}}`);
}

/** A sidebar link that isn't a wiki page: an absolute web address or it fails the build; browsers ignore tabs and spaces in a scheme, so a denylist won't do */
function externalHref(target) {
  if (!/^https?:\/\/\S+$/i.test(target)) throw new Error(`Sidebar link is not a wiki page or a web address: ${target}`);

  return escapeHtml(target);
}

/** Plain text of the first paragraph, for the page's description */
function firstParagraph(source) {
  const block = source.split(/\n\s*\n/).find((part) => /^[A-Za-z*[]/.test(part.trim())) ?? '';
  const text = block.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();

  return text.length > 155 ? `${text.slice(0, 152).replace(/\s\S*$/, '')}...` : text;
}

function buildDocs() {
  const names = readdirSync(WIKI).flatMap((file) => (/^[A-Za-z0-9][\w-]*\.md$/.test(file) ? [file.replace(/\.md$/, '')] : []));
  const pageNames = new Set(names);
  const sidebar = [...readFileSync(join(WIKI, '_Sidebar.md'), 'utf8').matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((link) => ({ title: link[1], name: link[2] }));
  const paths = [];

  for (const name of names) {
    const source = readFileSync(join(WIKI, `${name}.md`), 'utf8').replace(/\r\n?/g, '\n');
    const path = name === 'Home' ? 'docs/' : `docs/${name.toLowerCase()}/`;
    const root = '../'.repeat(path.split('/').length - 1);
    const title = source.match(/^# (.+)$/m)?.[1] ?? name.replace(/-/g, ' ');
    const body = expandImages(rewriteWikiLinks(markdown.render(wikiPicturesToMacros(source)), root, pageNames), root);

    const links = sidebar
      .map((item) => {
        if (!pageNames.has(item.name)) return `<a href="${externalHref(item.name)}">${escapeHtml(item.title)}</a>`;

        const current = item.name === name ? ' aria-current="page"' : '';

        return `<a href="${root}docs/${item.name === 'Home' ? '' : `${item.name.toLowerCase()}/`}"${current}>${escapeHtml(item.title)}</a>`;
      })
      .join('\n        ');

    const aside = `<nav class="doc-nav" aria-label="Manual">
        ${links}
      </nav>`;

    writePage(path, articlePage({ title: title === 'Markloom' ? 'Manual' : title, description: firstParagraph(source), path, body, aside }));
    paths.push(path);
  }

  // Pictures only: an HTML or SVG file here would run on the editor's origin
  if (existsSync(join(WIKI, 'images'))) {
    cpSync(join(WIKI, 'images'), join(OUT, 'docs', 'images'), { recursive: true, filter: (file) => statSync(file).isDirectory() || /\.(png|jpe?g|gif|webp)$/i.test(file) });
  }

  return paths;
}

function buildLanding(guides) {
  const title = 'Markloom: free Markdown editor with Mermaid and Word export';
  const description = 'Free, open-source Markdown editor with live Mermaid diagrams, a rich-text mode and export to Word, PDF and HTML. In your browser or on your desktop.';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Markloom',
    url: SITE_URL,
    description,
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Windows, macOS, Linux, Web browser',
    softwareVersion: version,
    downloadUrl: `${REPO_URL}/releases/latest`,
    license: 'https://opensource.org/licenses/MIT',
    image: `${SITE_URL}og-image.png`,
    author: { '@type': 'Person', name: 'boudou', url: 'https://github.com/boudou' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };

  const guideLinks = guides
    .map((guide) => `<li><a href="guides/${guide.slug}/">${escapeHtml(guide.title)}</a><p>${escapeHtml(guide.summary)}</p></li>`)
    .join('\n          ');

  const html = readFileSync(join(SITE, 'index.html'), 'utf8')
    .replace('{{head}}', head({ title, description, path: '' , rootPath: '' }))
    .replace('{{jsonld}}', JSON.stringify(jsonLd))
    .replace('{{header}}', header(''))
    .replace('{{footer}}', footer(''))
    .replace('{{guides}}', guideLinks)
    .replace('{{version}}', version);

  writePage('index.html', expandImages(html, ''));
}

function buildNotFound() {
  const root = new URL(SITE_URL).pathname;

  writePage('404.html', `<!DOCTYPE html>
<html lang="en">
  <head>
    ${head({ title: 'Page not found | Markloom', description: 'This page does not exist.', path: '404', noindex: true, rootPath: root })}
  </head>
  <body>
    ${header(root)}
    <div class="article-layout">
      <main class="prose">
        <h1>That page isn't here</h1>
        <p>It may have moved when the editor moved to its own address. <a href="${root}app/">Open the editor</a> or <a href="${root}">go to the home page</a>.</p>
      </main>
    </div>
    ${footer(root)}
  </body>
</html>
`);
}

function copyAssets() {
  cpSync(join(ROOT, 'dist'), join(OUT, 'app'), { recursive: true });
  cpSync(join(SITE, 'site.css'), join(OUT, 'site.css'));

  for (const file of ['markloom.png', 'og-image.png']) cpSync(join(ROOT, 'public', file), join(OUT, file));

  mkdirSync(join(OUT, 'fonts'));

  for (const font of FONTS) {
    const family = font.split('-latin-')[0];

    cpSync(join(ROOT, 'node_modules/@fontsource', family, 'files', `${font}.woff2`), join(OUT, 'fonts', `${font}.woff2`));
  }

  mkdirSync(join(OUT, 'images'));

  for (const file of readdirSync(join(ROOT, 'docs/screenshots'))) {
    if (/\.(png|gif)$/.test(file)) cpSync(join(ROOT, 'docs/screenshots', file), join(OUT, 'images', file));
  }

  // Installs from when the editor lived at the site root still ask this address for their service worker:
  // this one takes over and removes itself. The editor registers its own under /app/.
  writeFileSync(
    join(OUT, 'sw.js'),
    `self.addEventListener('install', () => self.skipWaiting());\nself.addEventListener('activate', () => self.registration.unregister());\n`
  );
}

function writeSitemap(paths) {
  const urls = paths.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`).join('\n');

  writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}

function allHtmlFiles(folder) {
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name);

    if (statSync(full).isDirectory()) return full === join(OUT, 'app') ? [] : allHtmlFiles(full);

    return name.endsWith('.html') ? [full] : [];
  });
}

/** Every relative link and image of the site must point at a file in it */
function checkLinks() {
  const sitePath = new URL(SITE_URL).pathname;
  const broken = [];

  for (const file of allHtmlFiles(OUT)) {
    const html = readFileSync(file, 'utf8');
    const folder = posix.join(sitePath, relative(OUT, dirname(file)).replace(/\\/g, '/'), '/');

    for (const match of html.matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)) {
      const target = match[1];

      if (/^(https?:|mailto:|#)/.test(target)) continue;

      const clean = target.split(/[?#]/)[0];
      const absolute = clean.startsWith('/') ? clean : posix.join(folder, clean);
      const onDisk = join(OUT, absolute.slice(sitePath.length));
      const exists = existsSync(onDisk) && (!statSync(onDisk).isDirectory() || existsSync(join(onDisk, 'index.html')));

      if (!exists) broken.push(`${relative(OUT, file)}: ${target}`);
    }
  }

  if (broken.length) {
    console.error(`Broken links:\n${broken.join('\n')}`);
    process.exit(1);
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
copyAssets();

const guides = buildGuides();
const docPaths = buildDocs();

buildLanding(guides);
buildNotFound();
writeSitemap(['', ...guides.map((guide) => `guides/${guide.slug}/`), ...docPaths]);
checkLinks();
console.log(`_site/: landing, ${guides.length} guides, ${docPaths.length} manual pages`);
