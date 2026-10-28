// YAML front matter in rich text: one read-only block at the top, collapsed like the preview's, that
// lists the keys and opens to show the YAML as written. It is edited in Markdown mode, so rich text
// never alters it: the value is written back unchanged, and preserve.ts keeps the original fences.
import remarkFrontmatter from 'remark-frontmatter';
import { $nodeSchema, $remark, $view } from '@milkdown/kit/utils';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { NodeView } from '@milkdown/kit/prose/view';
import { frontMatterSummary } from '@/lib/markdown';

function frontMatterValue(node: ProseNode): string {
  return String(node.attrs.value ?? '');
}

// YAML only, given explicitly: Milkdown passes `{}` when there are no options, which the plugin reads as a matter
const frontMatterRemark = $remark('markloomFrontMatter', () => remarkFrontmatter, 'yaml');

// No parseDOM: pasted HTML never makes front matter in the middle of a document
const frontMatterSchema = $nodeSchema('front_matter', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  attrs: { value: { default: '', validate: 'string' } },
  toDOM: (node) => ['div', { 'data-type': 'front_matter' }, frontMatterValue(node)],
  parseMarkdown: {
    match: (node) => node.type === 'yaml',
    runner: (state, node, type) => {
      // SAFETY: a remark yaml node (mdast-util-frontmatter) has a string value.
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'front_matter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, frontMatterValue(node));
    },
  },
}));

class FrontMatterView implements NodeView {
  dom: HTMLDetailsElement;
  private summary: HTMLElement;
  private keys: HTMLSpanElement;
  private code: HTMLElement;

  constructor(private node: ProseNode) {
    this.dom = document.createElement('details');
    this.dom.className = 'front-matter';
    this.dom.contentEditable = 'false';
    this.summary = document.createElement('summary');
    this.summary.textContent = 'Front matter';
    this.keys = document.createElement('span');
    this.keys.className = 'front-matter-keys';
    this.summary.append(this.keys);
    const pre = document.createElement('pre');
    this.code = document.createElement('code');
    pre.append(this.code);
    const hint = document.createElement('p');
    hint.className = 'front-matter-hint';
    hint.textContent = 'Edit front matter in Markdown mode.';
    this.dom.append(this.summary, pre, hint);
    this.render();
  }

  private render() {
    const value = frontMatterValue(this.node);
    this.keys.textContent = frontMatterSummary(value);
    this.code.textContent = value;
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;

    const changed = frontMatterValue(node) !== frontMatterValue(this.node);
    this.node = node;

    if (changed) this.render();

    return true;
  }

  stopEvent(event: Event) {
    const target = event.target;

    // A click on the summary opens or closes the block instead of selecting it
    return target instanceof Node && this.summary.contains(target);
  }

  ignoreMutation() {
    return true;
  }
}

const frontMatterView = $view(frontMatterSchema.node, () => (node) => new FrontMatterView(node));

export const frontMatter = [frontMatterRemark, frontMatterSchema, frontMatterView].flat();
