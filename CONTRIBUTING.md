# Contributing to Markloom

Thanks for your interest! Bug reports, ideas and pull requests are welcome. Good first stops are the open [enhancement issues](https://github.com/boudou/Markloom/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement).

## Setup

```bash
npm install
npm run dev            # web app on http://localhost:1420
npm run electron:dev   # desktop app with live reload
```

Node.js 22.12+ is required.

## Before opening a pull request

- Run `npm run build`. It type-checks the project and must pass.
- Keep changes focused; one topic per pull request.
- Match the surrounding code: naming, comment density, idiom.
- Keep heavy libraries out of the startup bundle (Mermaid, highlight.js grammars, docx and the rich-text editor load lazily).
- Add new shortcuts to `src/lib/shortcuts.ts`, the single shortcut table.

## Reporting bugs

Open an issue with the steps to reproduce, what you expected, what happened, and your OS and whether you used the web or desktop build. For documents that trigger a bug, a minimal Markdown sample helps most.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
