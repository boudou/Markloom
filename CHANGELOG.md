# Changelog

Notable changes to Markloom. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
