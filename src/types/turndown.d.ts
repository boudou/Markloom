// turndown and turndown-plugin-gfm ship no types: the subset editor/codemirror/htmlToMarkdown.ts uses

declare module 'turndown' {
  interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    bulletListMarker?: '-' | '+' | '*';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: '```' | '~~~';
    emDelimiter?: '_' | '*';
    strongDelimiter?: '**' | '__';
    br?: string;
  }

  type TurndownFilter = string | string[] | ((node: HTMLElement, options: TurndownOptions) => boolean);

  interface TurndownRule {
    filter: TurndownFilter;
    replacement: (content: string, node: HTMLElement, options: TurndownOptions) => string;
  }

  type TurndownPlugin = (service: TurndownService) => void;

  class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(input: string | HTMLElement): string;
    use(plugin: TurndownPlugin | TurndownPlugin[]): this;
    addRule(key: string, rule: TurndownRule): this;
    keep(filter: TurndownFilter): this;
    remove(filter: TurndownFilter): this;
    escape(text: string): string;
  }

  export type { TurndownOptions, TurndownPlugin, TurndownRule };
  export default TurndownService;
}

declare module 'turndown-plugin-gfm' {
  import type { TurndownPlugin } from 'turndown';

  export const gfm: TurndownPlugin;
  export const tables: TurndownPlugin;
  export const strikethrough: TurndownPlugin;
  export const taskListItems: TurndownPlugin;
  export const highlightedCodeBlock: TurndownPlugin;
}
