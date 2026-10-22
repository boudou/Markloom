# Changelog

Notable changes to Markloom. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.7.0] - 2026-10-22

### Added

- Page width for rich text and the preview: Readable, Wide or Full, from the editor toolbar or the command palette, remembered between sessions (#180).
- The web version can be installed as an app from Chrome or Edge, opens offline after the first visit, and once installed can open `.md` files from the system's Open with menu (#177).
- Rich text renders raw HTML the way the preview does: images, line breaks, links and inline tags show as formatted content, and unpaired tags such as `<div align="center">` become small markers instead of code. Click a block to edit its HTML (#181).
- A new logo: a pen drawing a line, used for the app icon, the title bar and link previews.

### Changed

- Images in the preview and rich text sit inline, as on GitHub, so rows of badges no longer stack one per line.
- The web version has a description, link-preview card and search metadata.
- Accessibility: the tab bar exposes only tabs to screen readers, the editor placeholder meets contrast, the Commands button's name matches its label, and "Skip to document" moves focus into the editor (#176).

### Fixed

- Rich text no longer deletes link reference definitions (`[d]: https://…`) and footnote definitions when you edit a document (#178).
- Text typed right after a link in rich text is plain text, not part of the link (#163).
- Diagram error details show the same document line as the summary (#166).
- A heading emptied in a new document is written as `# `, as in Markdown mode (#169).
- Search results in `.mmd` files open at the matching line (#172).

## [0.6.0] - 2026-10-22

### Added

- Markloom runs in the browser with nothing to install: the web version is published at [boudou.github.io/Markloom](https://boudou.github.io/Markloom/) with every release.
- Quick open (`Ctrl+P`) finds any file in the open folder by name (#5).
- Search across files (`Ctrl+Shift+F`): a Search view in the sidebar lists matching lines grouped by file, with match case, whole word and regular expressions; clicking a result opens the file at that line (#6).
- Copy as rich text, in the title bar and the command palette, copies the selection or the whole document so it pastes formatted into email, Google Docs or Confluence, with diagrams as images (#8).
- The status bar shows the version and links to the user manual and the source; the web version also links to the desktop download.

### Changed

- New documents are numbered (Untitled 2, Untitled 3…), so tabs and the save prompt tell them apart; the palette says "Insert ER diagram" and "Insert Gantt chart", and the Export tooltip mentions Web page (#151).
- Both editors share one image cache: an image edited in another app now refreshes in rich text too, and the desktop app reads a file in one call (#123).
- Every way of opening a document (file tree, recent files, links, files from the OS) goes through one path (#106).
- macOS builds are ad-hoc signed, so macOS offers **Open Anyway** instead of calling the app damaged; the README explains Windows Smart App Control (#161).

### Fixed

- Rich text no longer writes an emptied paragraph as `<br />` or an emptied heading as a bare `#` (#152).
- Images addressed as `//host/…` are no longer reported missing by the export check and are embedded in exports (#119).

### Internal

- Event targets are narrowed instead of cast (#139).

## [0.5.0] - 2026-10-22

### Added

- Unsaved Untitled documents are kept as drafts and offered back after a crash or an unexpected close (#150).

### Changed

- Undo history survives switching tabs, and each editor keeps its own history when you switch between Markdown and Rich text (#144, #145).
- Shortcut hints have spoken names for screen readers, and the title bar and command palette share one set of command labels (#124, #128).
- Exports load images and diagrams in parallel, word and character counts take one pass, and the template dialog loads only when opened (#105, #108, #126).
- Saved settings move to version 1: unused keys are removed from `markloom-settings` on first launch; recent files, editor options, auto-save, split ratio and the last session are kept (#91).
- Internal cleanup: shared path, error-message and diagram helpers, one fence model in the Markdown parser, stricter types, and removal of unused code (#92, #107, #115, #120, #121, #122, #125, #127, #129, #130, #131, #132, #134, #135, #136, #137, #138).

### Fixed

- Rich text: Ctrl+S, export or close right after typing now include the last keystrokes (#110).
- Rich text: the task-list shortcut creates a real task item instead of a bullet reading "[ ]" (#111).
- Rich text keeps a titled Mermaid fence's title when the block is edited (#115).
- Focus returns to the editor after the Insert and Text style menus, rich-text dialogs, and a dialog opened from another dialog (#112, #148).
- Ctrl+/ opens Keyboard shortcuts in the Markdown editor instead of commenting the line (#146).
- Bold can be removed from bold+italic text (#147).
- Clicking a heading in Contents scrolls only the preview, not the whole window, and line jumps land in the tab they were meant for (#133, #143).
- A word goal set on an unsaved document survives its first save (#149).
- Headings such as `## Title` keep their ids and can be linked to, and repeated headings get the same ids in the preview and rich text (#109, #116).
- Diagram errors point at the right line, including errors at the end of a diagram, in both editors (#117).
- Portable Markdown export keeps diagrams inside quotes and lists, and embeds images whose paths contain escaped characters (#114).
- The file tree handles two folders with the same name and ignores a folder read that finishes after you opened another folder (#118).

## [0.4.0] - 2026-10-21

### Added

- Auto-save: turn it on from the status bar or the command palette (off by default). Documents saved to a file are written 30 seconds after you stop typing, each on its own timer, and the status bar shows each document's own result (#75, #141).
- Find and replace shows a live match count while you type, in both editors (#79).
- Version history collapses unchanged lines in the comparison and loads quickly however many versions a document has (#88).

### Changed

- Faster typing in large documents: the app no longer re-renders on every keystroke, and scroll sync, rich-text decorations, word counts and resize drags do less work per frame (#66, #85).
- Diagrams render once and are reused across the preview, rich text, the diagram editor and exports (#77).
- Images in the preview are read once and re-checked when you come back to the window, instead of on every pause in typing (#72, #95).
- Shortcut keys show correctly on macOS and Windows, and the Shortcuts window finds plain key names (#82, #96).
- In Regex mode, `\n` and `\t` in the replacement insert a line break and a tab; outside Regex mode the replacement is inserted exactly as typed (#70, #142).
- Building from source needs Node.js 22.18 or newer, which `npm run lint` requires; CI now runs the lint (#103).

### Fixed

- Undo never brings back another document's text, and Save As keeps your scroll position (#71).
- Export no longer fails silently on unusual image paths, rewrites images inside code blocks, or hangs after a failed font read; repeated diagrams in a web page export get their own ids (#73, #98).
- A Mermaid fence with a title is treated the same everywhere (#74), and the diagram editor's Refresh redraws the diagram (#97).
- Heading links (`#see-docs`) match the Contents panel and GitHub (#81).
- Open folders keep their contents after Refresh, and read errors show their real reason (#84, #99, #100).
- Templates insert today's date even when the app has been open since an earlier day (#83).
- Find Next lands on the nearest match after you edit, and the find bar no longer errors when switching modes (#93, #94).
- Resize handles follow only the pointer that started the drag (#102).

### Security

- Desktop: opening a document trusts only document, image and PDF files in its folder (never a whole home folder or drive), and only documents, and images in `assets/`, can be written (#67).
- Desktop: PDF export can no longer read local files into the PDF (#68).
- Desktop: linked files open in locked-down windows (no app access, no scripts except the PDF viewer), SVGs show as images, other types download, and the app only answers its own window (#69).
- CI runs with a read-only token (#90).

## [0.3.0] - 2026-10-20

### Added

- Selection count: while text is selected, in either editor, the status bar shows its words and characters (#10).
- Word goals: set a word count for a document in *Document statistics*; the status bar shows progress and turns green when you reach it. Goals are remembered per document (#10).

### Changed

- Menus, popovers, context menus, tooltips and dialogs take on [interior.dev](https://interior.dev)'s look and motion: a hairline-ringed surface, a spring-in and quick-out, one highlight that slides between menu items (and command palette rows), light tooltips that rise on first show and swap between neighbours, and buttons that press down.

## [0.2.0] - 2026-10-20

### Added

- Callouts: GitHub-style `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` quotes show as coloured, titled boxes in the preview and in Word, PDF and HTML exports (#13).
- Copy button on code blocks in the preview.

### Changed

- The Markdown / Rich text switch slides between modes, and the export button no longer changes width while it works (both after [interior.dev](https://interior.dev)).
- Toolbar tooltips open straight away once one is showing, instead of waiting each time.
- Dependencies updated, including TypeScript 7 and Vite 8 (builds are about three times faster). Building from source needs Node.js 22.12 or newer.

### Fixed

- `Ctrl+Shift+M` now switches between Markdown and Rich text while the Markdown editor has focus.

### Security

- Resolved all open Dependabot alerts: KaTeX 0.19 for Mermaid's math labels, and newer postcss-selector-parser and global-agent in the build tooling.

## [0.1.0] - 2026-10-20

First public release.

### Added

- Split-view Markdown editor (CodeMirror) with live preview and line-anchored scroll sync.
- Rich-text editor (Milkdown) that keeps untouched Markdown byte-for-byte.
- Live Mermaid diagrams, with errors reported against document line numbers.
- Export to Word (.docx), PDF, standalone HTML and portable Markdown, with diagrams and images embedded.
- Multiple tabs, folder tree, outline, recent files, templates, version history and session restore.
- Find and replace in both editors, command palette and a single keyboard-shortcut table.
- Dropped and pasted images saved to `assets/` beside the document.
- Desktop app (Electron) with file associations for `.md`, `.markdown` and `.mdx`.
- Installers for Windows, macOS and Linux, built by CI and attached to each release.
- [Wiki](https://github.com/boudou/Markloom/wiki) with a user manual and shortcut reference.

[Unreleased]: https://github.com/boudou/Markloom/compare/v0.5.0...HEAD
[0.7.0]: https://github.com/boudou/Markloom/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/boudou/Markloom/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/boudou/Markloom/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/boudou/Markloom/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/boudou/Markloom/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/boudou/Markloom/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/boudou/Markloom/releases/tag/v0.1.0
