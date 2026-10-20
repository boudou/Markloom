# Markloom

A Markdown editor with first-class Mermaid diagrams and clean document export. Runs in the browser or as a desktop app.

![Markloom split view: Markdown source on the left, live preview with a Mermaid diagram on the right](docs/screenshots/split-view.png)

## Features

- **Two editors**: split view (CodeMirror source plus live preview) or rich text (Milkdown) that keeps untouched Markdown byte-for-byte
- **Mermaid diagrams**: rendered live, with errors reported as "Line N: …" against your document
- **Export**: Word (.docx), PDF, standalone HTML and portable Markdown, with diagrams and images embedded
- **Multi-tab editing**, folder tree, document outline, recent files and session restore
- **Find & replace** that works in both editors, plus a command palette (Ctrl+Shift+P)
- **Image drop and paste**: images are saved to `assets/` beside the document
- **Syntax highlighting**, templates, version history, native spell check
- **Synced scrolling** between source and preview
- **Private by design**: documents stay on your machine; Markdown is sanitized and Mermaid runs in strict mode

## How to use

1. **Open a folder** (`Ctrl+Shift+O`) to browse your Markdown files in the sidebar, or **open a single file** (`Ctrl+O`). **New document** and **New from template** start from scratch.
2. **Write** in the Markdown editor with the live preview beside it. Switch to **Rich text** (`Ctrl+Shift+M`) to edit visually; only the parts you touch are rewritten, so your diffs stay small.
3. **Add a diagram** with a fenced `mermaid` block. It renders as you type, and syntax errors point to the exact line:

   ````markdown
   ```mermaid
   flowchart LR
     A[Write] --> B[Preview] --> C[Export]
   ```
   ````

4. **Add images** by dropping or pasting them. They are saved to an `assets/` folder next to the document.
5. **Find your way around**: `Ctrl+F` finds, `Ctrl+H` replaces, `Ctrl+Shift+L` shows the document outline, and `Ctrl+Shift+H` opens version history.
6. **Export** (`Ctrl+E`) to Word, PDF, a standalone web page or portable Markdown.
7. **Do anything from the keyboard**: `Ctrl+Shift+P` opens the command palette (commands and recent files), and `Ctrl+/` lists every shortcut. On macOS, use `⌘` instead of `Ctrl`.

In the browser, new-document and close-tab use `Alt+N` and `Alt+W`, because the browser keeps `Ctrl+N` and `Ctrl+W`.

| Rich text editing | Export | Command palette |
| :---: | :---: | :---: |
| ![Rich text editor](docs/screenshots/rich-text.png) | ![Export dialog](docs/screenshots/export.png) | ![Command palette](docs/screenshots/command-palette.png) |

> **Browser support:** opening folders needs the File System Access API, so use Chrome, Edge or another Chromium-based browser. The desktop app has no such limit.

## Getting started

Requires Node.js 18+ and npm.

```bash
npm install
npm run dev             # web app on http://localhost:1420
```

### Desktop app

```bash
npm run electron:dev    # live-reload desktop window
npm run electron:build  # installers in release/
```

On Windows, `start-desktop.bat` launches the packaged app (`start-desktop.bat rebuild` builds it first).

### Production build (web)

```bash
npm run build
npm run preview
```

## Tech stack

React 18, TypeScript, Vite, Tailwind CSS with Radix UI, Zustand, CodeMirror 6, Milkdown, markdown-it, Mermaid, docx, Electron.

## Roadmap

Planned work is tracked as [enhancement issues](https://github.com/boudou/Markloom/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement). Pick one, comment that you're on it, and see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
