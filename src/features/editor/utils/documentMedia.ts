// Relative media addresses in rendered HTML other than img[src] (which each surface resolves itself):
// srcset on <img> and on a <picture>'s <source>, the src of <video>, <audio> and their <source>, and a
// video's poster. They load from the open folder through the image cache's object URLs; absolute
// addresses (https:, data:, blob:, //host) stay as written.
import { canResolveRelative } from '@/features/file-tree/api/fileSystem';
import { isAbsoluteUrl, resolveSourcePath } from '@/lib/documentPath';
import { documentFileUrl } from './previewImages';

interface MediaCandidate {
  url: string;
  /** Width or density descriptor, '' when there is none */
  descriptor: string;
}

interface MediaRule {
  /** The attribute holding the address */
  attribute: 'srcset' | 'src' | 'poster';
  /** Where the attribute's value as written is kept once the live one has been changed */
  original: string;
  selector: string;
  /** The addresses in the attribute's value */
  parse: (value: string) => MediaCandidate[];
}

/** The candidates of a srcset (HTML's grammar, simplified): commas inside a URL such as data: stay in it. */
function parseSrcset(value: string): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  let index = 0;

  while (index < value.length) {
    while (index < value.length && /[\s,]/.test(value[index])) index++;

    if (index >= value.length) break;

    const urlStart = index;

    while (index < value.length && !/\s/.test(value[index])) index++;

    const url = value.slice(urlStart, index);

    if (url.endsWith(',')) {
      candidates.push({ url: url.replace(/,+$/, ''), descriptor: '' });

      continue;
    }

    const descriptorEnd = value.indexOf(',', index);
    const end = descriptorEnd === -1 ? value.length : descriptorEnd;
    candidates.push({ url, descriptor: value.slice(index, end).trim() });
    index = end + 1;
  }

  return candidates;
}

/** A src or poster holds one address, spaces included (`my clip.mp4`) */
function parseSingle(value: string): MediaCandidate[] {
  return [{ url: value.trim(), descriptor: '' }];
}

const RULES: MediaRule[] = [
  {
    attribute: 'srcset',
    original: 'data-document-srcset',
    selector: 'img[srcset], picture > source[srcset]',
    parse: parseSrcset,
  },
  {
    attribute: 'src',
    original: 'data-document-src',
    selector: 'video[src], audio[src], video > source[src], audio > source[src]',
    parse: parseSingle,
  },
  {
    attribute: 'poster',
    original: 'data-document-poster',
    selector: 'video[poster]',
    parse: parseSingle,
  },
];

// Set while an element's addresses are being read, so a failed load of the address as written
// (against the app's own server) isn't taken for a missing image
const PENDING = 'data-media-pending';

/** The attribute value for `candidates`; null (remove the attribute) when there are none */
function formatCandidates(candidates: MediaCandidate[]): string | null {
  if (candidates.length === 0) return null;

  return candidates.map(({ url, descriptor }) => (descriptor ? `${url} ${descriptor}` : url)).join(', ');
}

function isRelative({ url }: MediaCandidate): boolean {
  return url !== '' && !isAbsoluteUrl(url) && !url.startsWith('#');
}

function fileUrl(docPath: string, url: string): Promise<string | null> {
  return documentFileUrl(resolveSourcePath(docPath, url)).catch(() => null);
}

/** The value with each relative address read from the folder; addresses that can't be read are left out */
async function resolvedValue(candidates: MediaCandidate[], docPath: string): Promise<string | null> {
  const urls = await Promise.all(candidates.map((candidate) => (isRelative(candidate) ? fileUrl(docPath, candidate.url) : candidate.url)));

  return formatCandidates(
    candidates.flatMap((candidate, index) => {
      const url = urls[index];

      return url ? [{ url, descriptor: candidate.descriptor }] : [];
    })
  );
}

/** One attribute of an element waiting to be read: its value as written and the addresses in it */
interface PendingMedia {
  rule: MediaRule;
  original: string;
  candidates: MediaCandidate[];
}

/** Writes `value` only when it differs: assigning a media src again restarts playback. Returns whether it changed. */
function setAttribute(element: Element, name: string, value: string | null): boolean {
  if (element.getAttribute(name) === value) return false;

  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);

  return true;
}

async function resolveElement(element: Element, media: PendingMedia[], docPath: string): Promise<void> {
  let sourceChanged = false;

  await Promise.all(
    media.map(async ({ rule, original, candidates }) => {
      const value = await resolvedValue(candidates, docPath);

      // A later pass has moved on (the element shows another value now)
      if (element.getAttribute(rule.original) !== original) return;

      if (setAttribute(element, rule.attribute, value) && element instanceof HTMLSourceElement) sourceChanged = true;
    })
  );

  element.removeAttribute(PENDING);

  // A changed <source> doesn't make its video or audio choose again by itself
  const parent = element.parentElement;

  if (sourceChanged && parent instanceof HTMLMediaElement) parent.load();
}

/**
 * Points the relative media addresses under `root` at their files in the folder of `docPath`.
 * The addresses as written are taken off at once (so nothing asks the app's own server for them)
 * and come back as object URLs once read. Called again on the same elements, it re-reads the
 * files, so a file changed in another app shows its new version.
 */
export function showDocumentMedia(root: ParentNode, docPath: string | null): void {
  const resolvable = canResolveRelative(docPath) ? docPath : null;
  const elements = new Map<Element, PendingMedia[]>();

  for (const rule of RULES) {
    for (const element of root.querySelectorAll(`${rule.selector}, [${rule.original}]`)) {
      const seen = element.getAttribute(rule.original);
      const original = seen ?? element.getAttribute(rule.attribute) ?? '';
      const candidates = rule.parse(original);

      if (!candidates.some(isRelative)) continue;

      if (seen === null) {
        element.setAttribute(rule.original, original);
        // Until the folder has been read, only the absolute addresses
        setAttribute(element, rule.attribute, formatCandidates(candidates.filter((candidate) => !isRelative(candidate))));
      }

      if (!resolvable) continue;

      element.setAttribute(PENDING, '');
      const entry = { rule, original, candidates };
      const media = elements.get(element);

      if (media) media.push(entry);
      else elements.set(element, [entry]);
    }
  }

  if (!resolvable) return;

  elements.forEach((media, element) => void resolveElement(element, media, resolvable));
}

/** Whether `element`'s media addresses are still being read from the folder */
export function isMediaPending(element: Element): boolean {
  return element.hasAttribute(PENDING);
}
