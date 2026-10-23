// Reference-style links in rich text (#186). Milkdown's commonmark preset inlines `[text][label]`
// and drops every `[label]: url` definition (remark-inline-links); RichTextEditor leaves that plugin
// out and this keeps both as written instead:
//  - a `linkReference` mark that shows as a link and writes back `[docs][d]`, `[guide][]` or `[Guide]`;
//  - a `definition` node, a muted read-only line that writes back `[d]: url "title"` where it was;
//  - deleting a definition turns the references left without one into inline links, so no URL is lost.
// Image references (`![logo][img]`) are image nodes that remember their label (imageSchemaFix in
// plugins.ts), so they too come back as written.
import type { Definition, Nodes, Root } from 'mdast';
import type { Transformer } from 'unified';
import { $markSchema, $nodeSchema, $prose, $remark } from '@milkdown/kit/utils';
import { imageSchema, linkSchema, sanitizeLinkHref } from '@milkdown/kit/preset/commonmark';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, type Transaction } from '@milkdown/kit/prose/state';

/** Where a reference points, written onto the mdast node by the remark step for the schemas to read */
export interface ResolvedReference {
  url?: string;
  title?: string;
}

declare module 'mdast' {
  interface LinkReferenceData extends ResolvedReference {}

  interface ImageReferenceData extends ResolvedReference {}
}

/** A label as CommonMark matches it: case-insensitive, runs of whitespace as one space */
function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function collectDefinitions(node: Nodes, definitions: Map<string, Definition>) {
  // The first definition of a label wins, as in CommonMark
  if (node.type === 'definition') {
    if (!definitions.has(node.identifier)) definitions.set(node.identifier, node);

    return;
  }

  if ('children' in node) for (const child of node.children) collectDefinitions(child, definitions);
}

function resolveReferences(node: Nodes, definitions: Map<string, Definition>) {
  if (node.type === 'linkReference' || node.type === 'imageReference') {
    const definition = definitions.get(node.identifier);
    node.data = { ...node.data, url: definition?.url ?? '', title: definition?.title ?? '' };
  }

  if ('children' in node) for (const child of node.children) resolveReferences(child, definitions);
}

function remarkReferences(): Transformer<Root, Root> {
  return (tree) => {
    const definitions = new Map<string, Definition>();
    collectDefinitions(tree, definitions);
    resolveReferences(tree, definitions);
  };
}

const referencesRemark = $remark('markloomReferences', () => remarkReferences);

function attr(node: ProseNode, name: string): string {
  return String(node.attrs[name] ?? '');
}

/** `[docs][d]` as a link; holds its label and the URL it resolved to when the document was read */
export const linkReferenceSchema = $markSchema('linkReference', () => ({
  attrs: {
    identifier: { default: '', validate: 'string' },
    label: { default: '', validate: 'string' },
    referenceType: { default: 'full', validate: 'string' },
    href: { default: '', validate: 'string' },
    title: { default: '', validate: 'string' },
  },
  inclusive: false,
  excludes: 'linkReference link',
  // No parseDOM: a pasted anchor becomes an inline link (the link mark's rule), never a reference
  // whose definition isn't in this document
  toDOM: (mark) => [
    'a',
    {
      href: sanitizeLinkHref(mark.attrs.href),
      title: mark.attrs.title || null,
      'data-reference': mark.attrs.label,
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'linkReference',
    runner: (state, node, markType) => {
      // SAFETY: the remark step above wrote the resolved url and title into every linkReference's data.
      const data = node.data as ResolvedReference | undefined;
      const identifier = String(node.identifier ?? '');
      state.openMark(markType, {
        identifier,
        label: String(node.label ?? identifier),
        referenceType: String(node.referenceType ?? 'full'),
        href: data?.url ?? '',
        title: data?.title ?? '',
      });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'linkReference',
    runner: (state, mark) => {
      state.withMark(mark, 'linkReference', undefined, {
        identifier: mark.attrs.identifier,
        label: mark.attrs.label,
        referenceType: mark.attrs.referenceType,
      });
    },
  },
}));

function definitionText(node: ProseNode): string {
  const title = attr(node, 'title');

  return `[${attr(node, 'label')}]: ${attr(node, 'url')}${title ? ` "${title}"` : ''}`;
}

/** `[d]: https://… "title"`: shown as a muted line, kept where it was; edited in Markdown mode */
export const definitionSchema = $nodeSchema('definition', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  attrs: {
    identifier: { default: '', validate: 'string' },
    label: { default: '', validate: 'string' },
    url: { default: '', validate: 'string' },
    title: { default: '', validate: 'string' },
  },
  toDOM: (node) => [
    'div',
    {
      class: 'rt-definition',
      'data-type': 'definition',
      'data-label': attr(node, 'label'),
      'data-url': attr(node, 'url'),
      'data-title': attr(node, 'title'),
      contenteditable: 'false',
    },
    definitionText(node),
  ],
  parseDOM: [
    {
      tag: 'div[data-type="definition"]',
      getAttrs: (dom) => {
        const label = dom.dataset.label ?? '';

        return { identifier: normalizeLabel(label), label, url: dom.dataset.url ?? '', title: dom.dataset.title ?? '' };
      },
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'definition',
    runner: (state, node, type) => {
      // A missing title is null, which ProseMirror rejects for a string attribute
      const identifier = String(node.identifier ?? '');
      state.addNode(type, {
        identifier,
        label: String(node.label ?? identifier),
        url: String(node.url ?? ''),
        title: String(node.title ?? ''),
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'definition',
    runner: (state, node) => {
      state.addNode('definition', undefined, undefined, {
        identifier: attr(node, 'identifier'),
        label: attr(node, 'label'),
        url: attr(node, 'url'),
        title: attr(node, 'title') || null,
      });
    },
  },
}));

/** Whether a step of `tr` replaced a range that held a definition (typing never scans) */
function removedDefinition(tr: Transaction): boolean {
  return tr.steps.some((step, i) => {
    let found = false;

    step.getMap().forEach((oldStart, oldEnd) => {
      if (found || oldStart === oldEnd) return;

      tr.docs[i].nodesBetween(oldStart, oldEnd, (node) => {
        if (node.type.name === 'definition') found = true;

        return !found;
      });
    });

    return found;
  });
}

/** Deleting a definition turns the references left without one into inline links, in the same undo step */
const danglingReferences = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey('markloom-dangling-references'),
      appendTransaction: (transactions, _oldState, newState) => {
        if (!transactions.some((tr) => tr.docChanged && removedDefinition(tr))) return null;

        const defined = new Set<string>();
        newState.doc.descendants((node) => {
          if (node.type.name === 'definition') defined.add(attr(node, 'identifier'));
        });

        const referenceType = linkReferenceSchema.type(ctx);
        const linkType = linkSchema.type(ctx);
        const imageType = imageSchema.type(ctx);
        const tr = newState.tr;
        newState.doc.descendants((node, pos) => {
          // An image reference forgets its label and is written inline
          if (node.type === imageType && attr(node, 'identifier') && !defined.has(attr(node, 'identifier'))) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, identifier: '', label: '', referenceType: '' });
          }

          if (!node.isText) return;

          for (const mark of node.marks) {
            if (mark.type !== referenceType || defined.has(mark.attrs.identifier)) continue;

            const end = pos + node.nodeSize;
            tr.removeMark(pos, end, mark);
            tr.addMark(pos, end, linkType.create({ href: mark.attrs.href, title: mark.attrs.title || null }));
          }
        });

        return tr.docChanged ? tr : null;
      },
    })
);

export const references = [referencesRemark, linkReferenceSchema, definitionSchema, danglingReferences].flat();
