# Changelog

Notable changes to Markloom. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Callouts: GitHub-style `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` quotes show as coloured, titled boxes in the preview and in Word, PDF and HTML exports (#13).
- Copy button on code blocks in the preview.

### Changed

- The Markdown / Rich text switch slides between modes, and the export button no longer changes width while it works (both after [interior.dev](https://interior.dev)).
- Toolbar tooltips open straight away once one is showing, instead of waiting each time.
- Dependencies updated, including TypeScript 7 and Vite 8 (builds are about three times faster). Building from source needs Node.js 22.12 or newer.

### Security

- Resolved all open Dependabot alerts: KaTeX 0.19 for Mermaid's math labels, and newer postcss-selector-parser and global-agent in the build tooling.

### Fixed

- `Ctrl+Shift+M` now switches between Markdown and Rich text while the Markdown editor has focus.

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

[Unreleased]: https://github.com/boudou/Markloom/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/boudou/Markloom/releases/tag/v0.1.0
