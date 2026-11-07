---
title: Paste Markdown into Confluence, Google Docs or email with formatting
description: Copy Markdown as rich text and paste it formatted into Confluence, Google Docs, Word, Gmail or Outlook, with tables, code and Mermaid diagrams as images.
summary: Copy as rich text, so headings, tables and diagrams arrive formatted instead of as asterisks.
---

# Paste Markdown into Confluence, Google Docs or email with formatting

Paste Markdown into most editors and you get the raw text: pound signs, asterisks and pipes. Some tools convert some of it, but tables and diagrams are usually where that stops. A rendered diagram doesn't exist anywhere in your Markdown, so there is nothing for them to convert.

The fix is to copy the rendered document rather than the source.

## How to do it

1. Open your document in [Markloom](../../app/), in the browser or the [desktop app](../../#download).
2. To copy just a part, select it. With nothing selected, the whole document is copied.
3. Click **Copy as rich text** in the title bar, next to Export, or press `Ctrl+Shift+P` and search for it.
4. Paste into your email, your Google Doc or your Confluence page.

{{shot command-palette | The command palette in Markloom, open over a document}}

## What comes across

| In your Markdown | After pasting |
| --- | --- |
| Headings, bold, italic, links | Formatted text |
| Lists and task lists | Lists |
| Tables | Tables |
| Code blocks | Formatted blocks |
| Quotes | Quotes |
| Mermaid diagrams | Images |

Styles are written directly into the copied content, because email clients throw away stylesheets. Apps that only accept plain text get the Markdown.

Diagrams are pasted as pictures, so they can't be edited where you paste them. Keep the Markdown as your source, change the block there, and paste again.

## Notes for each destination

**Email (Gmail, Outlook).** Paste into the message body. Unlike a screenshot of the document, the text stays selectable and searchable. Send yourself a test first, since mail clients differ in how they handle pasted images.

**Google Docs.** Paste into the document. Check the headings after pasting if you rely on the outline.

**Confluence.** Paste into the page editor. Code blocks, images and tables can come through differently depending on your Confluence version and its settings, so check the result the first time.

**Word.** Pasting works, and for a whole document [the Word export](../markdown-to-word-with-mermaid/) is often better, since it produces a file with real heading structure.

## Questions

**Does this send my document anywhere?** No. Rendering and copying happen on your computer, and the clipboard is the only place the result goes.

**Which browsers support it?** Copy as rich text writes HTML and images to the clipboard. Chrome and Edge are the browsers Markloom is built and tested on, and the desktop app needs no browser at all.

**Can I do it without installing anything?** Yes. The [web version](../../app/) has the same command.
