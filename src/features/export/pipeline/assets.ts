// Images and diagrams for exports, resolved to self-contained data.
import { canResolveRelative, readFileBlob } from '@/features/file-tree/api/fileSystem';
import { isAbsoluteUrl, resolveSourcePath, webAddress } from '@/lib/documentPath';
import { renderMermaid } from '@/features/mermaid/utils/mermaidConfig';

export interface ExportImage {
  dataUrl: string;
  mime: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // SAFETY: readAsDataURL always yields a string result on load
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function measure(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 600, height: img.naturalHeight || 400 });
    img.onerror = () => reject(new Error('Image could not be decoded'));
    img.src = dataUrl;
  });
}

async function fromBlob(blob: Blob): Promise<ExportImage> {
  const dataUrl = await blobToDataUrl(blob);
  const { width, height } = await measure(dataUrl);

  return {
    dataUrl,
    mime: blob.type || dataUrl.slice(5, dataUrl.indexOf(';')),
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width,
    height,
  };
}

/**
 * Loads an image referenced by a document: relative to the document's folder,
 * a data URL, or a web address (https:, http: or //host). Returns null when it can't be loaded.
 */
export async function loadDocumentImage(src: string, docPath: string | null): Promise<ExportImage | null> {
  try {
    if (src.startsWith('data:')) return await fromBlob(await (await fetch(src)).blob());

    const web = webAddress(src);

    if (web) {
      const response = await fetch(web, { mode: 'cors' });

      if (!response.ok) return null;

      return await fromBlob(await response.blob());
    }

    if (isAbsoluteUrl(src) || !canResolveRelative(docPath)) return null;
    const path = resolveSourcePath(docPath, src);

    return await fromBlob(await readFileBlob(path));
  } catch {
    return null;
  }
}

export type ExportDiagram = { ok: true; svg: string; width: number; height: number } | { ok: false; error: string };

/** Renders a Mermaid diagram to a standalone SVG with real pixel dimensions; never rejects. */
export async function renderDiagram(code: string): Promise<ExportDiagram> {
  const result = await renderMermaid(code, 'export');

  if (!result.ok) return result;

  const doc = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
  const root = doc.documentElement;
  const [, , vbWidth, vbHeight] = (root.getAttribute('viewBox') ?? '0 0 600 400').split(/[\s,]+/).map(Number);
  const width = Math.ceil(vbWidth || 600);
  const height = Math.ceil(vbHeight || 400);
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.style.removeProperty('max-width');

  return { ok: true, svg: new XMLSerializer().serializeToString(root), width, height };
}

/** Loads each distinct key once, all at the same time, and maps every key to its result. */
export async function loadUnique<T>(keys: Iterable<string>, load: (key: string) => Promise<T>): Promise<Map<string, T>> {
  const unique = [...new Set(keys)];
  const results = await Promise.all(unique.map(load));

  return new Map(unique.map((key, i) => [key, results[i]]));
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/** Rasterizes an image (e.g. SVG or WebP) to a PNG, on white, at 2x for sharpness. */
export async function toPngBlob(dataUrl: string, width: number, height: number, scale = 2): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
  );
}

/** {@link toPngBlob}'s PNG as bytes. */
export async function toPngBytes(dataUrl: string, width: number, height: number, scale = 2): Promise<Uint8Array<ArrayBuffer>> {
  const blob = await toPngBlob(dataUrl, width, height, scale);

  return new Uint8Array(await blob.arrayBuffer());
}

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Rasterizes HTML to PNG bytes (on white, 2x): `content` and a stylesheet of `css`, drawn in
 * an SVG `<foreignObject>` of `width` × `height` CSS px. An SVG image can't load anything, so
 * fonts and images must already be data URLs. It is drawn from a `data:` URL, which leaves
 * the canvas readable (a `blob:` URL would taint it).
 */
export function htmlToPng(content: Element, css: string, width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  // An XHTML <html><body> so the stylesheet's `html` and `body` rules apply as on a page
  const doc = document.implementation.createDocument(XHTML_NS, 'html', null);
  const body = doc.createElementNS(XHTML_NS, 'body');
  const style = doc.createElementNS(XHTML_NS, 'style');
  style.textContent = css;
  body.append(style, doc.importNode(content, true));
  doc.documentElement.append(body);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const foreignObject = doc.createElementNS(SVG_NS, 'foreignObject');
  foreignObject.setAttribute('width', '100%');
  foreignObject.setAttribute('height', '100%');
  foreignObject.append(doc.documentElement);
  svg.append(foreignObject);

  return toPngBytes(svgDataUrl(new XMLSerializer().serializeToString(svg)), width, height);
}
