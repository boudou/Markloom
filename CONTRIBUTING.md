# Contributing to Markloom

Thanks for your interest! Bug reports, ideas and pull requests are welcome. Good first stops are the [good first issues](https://github.com/boudou/Markloom/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22), which are small and self-contained, then [help wanted](https://github.com/boudou/Markloom/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) and the other [enhancement issues](https://github.com/boudou/Markloom/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement). You don't need an issue to get started on an idea: [suggest it](https://github.com/boudou/Markloom/issues/new?template=feature_request.md).

## Setup

```bash
npm install
npm run dev            # web app on http://localhost:1420
npm run electron:dev   # desktop app with live reload
```

Node.js 22.18+ is required (`npm run lint` loads the TypeScript Oxlint plugin, which older Node 22 releases cannot run).

## Before opening a pull request

- Run `npm run build`. It type-checks the project and must pass.
- Run `npm run lint` (Oxlint with the vendored anti-slop rules in `tools/oxlint/anti-slop/`). It must exit without errors; `npm run lint -- --fix` adds the blank lines `require-readable-spacing` asks for.
- Keep changes focused; one topic per pull request.
- Match the surrounding code: naming, comment density, idiom.
- Keep heavy libraries out of the startup bundle (Mermaid, highlight.js grammars, docx and the rich-text editor load lazily).
- Add new shortcuts to `src/lib/shortcuts.ts`, the single shortcut table.

## End-to-end tests

The end-to-end tests in `e2e/` use [Playwright](https://playwright.dev/) and drive your installed Google Chrome, so there is no browser to download. They build the app, serve the build and run every test twice: in Markdown mode, and with the document opened straight into Rich text.

```bash
npm run test:e2e            # build, serve and run all tests headless
npm run test:e2e -- --ui    # pick and watch tests in Playwright's UI
```

The build is served on port 4173, and a second build with a test Google Analytics ID on port 5173; set `E2E_PORT` to move both (the second one is `E2E_PORT` + 1000). A test for a known gap is marked with the issue that tracks it and is expected to fail until that issue is fixed.

What the tests cover, one file per area:

| File | Area |
| --- | --- |
| `documents.spec.ts` | New document, open from the file tree, edit and save, closing with unsaved changes, tabs, Quick open, folder search, a file tree of documents only, recent files and folders on the start screen, session restore |
| `editing.spec.ts` | Toolbar formatting and its pressed state, find and replace, the command palette, focus mode, page width, smart typography |
| `focus.spec.ts` | The focus ring on the writing surface; a new document from a template takes the focus |
| `insert.spec.ts` | Insert menu blocks land after the current block (tables, code, dividers), one undo per insert, the Link button and `Ctrl+K` |
| `typography.spec.ts` | Smart typography on by default; turned off, the preview and every export show the text as typed |
| `rich-text.spec.ts` | Raw HTML in rich text (no Tab stops inside, its source survives the window losing focus); saving keeps untouched Markdown byte for byte; a key after clicking a block (definition, front matter, formula) acts on that block; the missing-image box |
| `references.spec.ts` | Reference-style links and images survive rich-text edits; deleting a definition turns its references into inline links |
| `code.spec.ts` | Code colours in rich text on its own: the preview's languages, colouring while you type, unlabelled and unknown languages left plain |
| `parity.spec.ts` | Every construct renders in both editors: images, diagrams, tables, task lists, strikethrough, callouts, highlighted code, math, footnotes |
| `callouts.spec.ts` | Callouts: each type's colour, icon and title, what is not a callout, editing and retyping the marker in rich text, saved byte for byte |
| `math.spec.ts` | Math: typesetting, prices and escapes stay text, editing a formula in rich text, typing `$…$` or `$$` to make math |
| `footnotes.spec.ts` | Footnotes: numbering, links and back-links, unique ids, scroll sync past a mid-document definition, exports, Copy as rich text, rich-text styling |
| `front-matter.spec.ts` | Front matter: one collapsed block with its keys in both editors, the Contents panel, saved byte for byte from rich text, left out of Web page and Word exports |
| `diagrams.spec.ts` | Mermaid renders and follows edits; an error names its document line and Show line goes there |
| `appearance.spec.ts` | Dark mode: applied before first paint, System follows the OS live, Settings and the palette command, dark colours in both editors and the preview, Mermaid in dark with readable labels (including author fills), redraw from the cache, the white logo, the desktop window told the theme, exports stay light, settings changed in another tab |
| `status-colours.spec.ts` | Word-goal, version-history diff and export preflight colours in dark and light |
| `export.spec.ts` | Word, PDF (print stubbed), Web page, portable Markdown, Image (one page, a .zip, or one long image), the preflight warnings, Copy as rich text |
| `settings.spec.ts` | The Settings window and each editor preference |
| `history.spec.ts` | The version history limit, trimming every file when it is lowered, Clear all |
| `whats-new.spec.ts` | What's new shows the release notes once after an update |
| `updates.spec.ts` | Check for updates (desktop only): a newer version with its link, up to date, a failed check |
| `window-settings.spec.ts` | Desktop window settings: tray toggles, and the Windows Explorer menu (installed and portable) |
| `desktop-folder.spec.ts` | A folder opened by the desktop app: the tree, open and save through the bridge, Quick open, search, the session |
| `offline.spec.ts` | The service worker: the web version opens offline, and loads when its cache can't be written |
| `web.spec.ts` | Nothing loads from Google before the visitor allows usage statistics |

### The pull request gate

Every pull request to `main` runs the tests its changed files can affect (`.github/workflows/e2e.yml`); pushes to `main` and release tags run them all. When a test fails, the Playwright report is attached to the run.

```bash
npm run test:e2e:affected                            # the tests your branch affects, against origin/main
npm run test:e2e:affected -- --base main --dry-run   # print the selection without running it
npm run test:e2e:affected -- --check                 # every file under src/ is in the impact map
```

`e2e/impact.json` maps source globs to test tags, such as `src/features/export/**` to `@export`. The script lists the changed files (`git diff <base>...HEAD`, plus uncommitted and untracked ones), collects their tags and runs the tests whose titles carry one, in both projects. A changed spec runs its own tests. Every test runs instead when a changed file matches nothing in the map, or is a shared foundation listed under `fullSuite` (`src/lib/markdown.ts`, `AppShell.tsx`, the stores, the styles, the build and test configuration).

To add a test, end its title with the tags of the areas it covers: `test('Word keeps footnotes @export', …)`. To add a source file, make sure a glob in `e2e/impact.json` matches it, or `--check` fails the gate and names the file.

## The website

`site/` holds the landing page and guides, and `scripts/build-site.mjs` assembles them with the manual (rendered from the wiki) and the editor into `_site/`. It fails on a broken internal link. Run `npm run build -- --base=/Markloom/app/` first, then `node scripts/build-site.mjs --wiki <wiki checkout>`. In Git Bash, prefix the build with `MSYS_NO_PATHCONV=1`. `node scripts/screenshots.mjs` retakes the images in `docs/screenshots/`, from a build with the default base.

## Reporting bugs

Open an issue with the steps to reproduce, what you expected, what happened, and your OS and whether you used the web or desktop build. For documents that trigger a bug, a minimal Markdown sample helps most.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
