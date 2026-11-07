---
title: Convert Markdown to Word with Mermaid diagrams
description: Turn a Markdown file into an editable Word document with its Mermaid diagrams drawn as images, without Pandoc or a filter. Free and open source.
summary: An editable .docx from a Markdown file, with the diagrams drawn, and no Pandoc filter to set up.
---

# Convert Markdown to Word with Mermaid diagrams

You wrote the design doc in Markdown. The diagram is a fenced `mermaid` block, which GitHub draws for you. Then someone asks for a Word copy to review, and the usual converter hands them the diagram's source code instead of the picture.

This guide shows how to get a `.docx` with the diagrams drawn, and what to do if a diagram breaks along the way.

## The quick way

1. Open [Markloom](../../app/) in Chrome or Edge, or use the [desktop app](../../#download). There is no account to create.
2. Press `Ctrl+O` and pick your Markdown file, or paste the text into a new document.
3. Check that the preview on the right shows your diagrams. They draw as you type.
4. Press `Ctrl+E`, keep **Word** selected, and choose **Export Word**.

{{shot export | The Export dialog with Word selected, in front of a document with a Mermaid flowchart}}

You get an editable Word document. Headings are real Word headings, so the navigation pane and a table of contents work. Lists, tables, code blocks and images carry over, and each diagram becomes an image at its place in the text.

The conversion runs on your computer. Your document isn't uploaded anywhere.

## What your reviewer can and can't edit

Everything except the diagrams is ordinary Word content. They can reword a paragraph, turn on Track Changes and leave comments. A diagram is a picture in Word, so to change one, change the `mermaid` block in your Markdown and export again.

That makes the Markdown your source and the Word file a copy for review. Take the reviewer's changes back into the Markdown by hand, the same way you would with any review copy. Markloom doesn't read `.docx` files back in.

## When a diagram won't draw

A typo in a diagram would normally surface when someone opens the exported file. Markloom checks first: before it exports, it lists diagrams that won't render and images it can't find, each with its line number in your document.

You see the same message while editing. It gives the line in your document rather than a line inside the diagram, and **Show line** takes you there.

## Other ways to do it

Markloom isn't the only route, and the others suit some jobs better.

**Pandoc with a Mermaid filter.** Pandoc doesn't draw Mermaid by itself. Community filters such as `mermaid-filter` run the Mermaid CLI during conversion, which needs Node.js and a headless browser on the machine. This is the right choice when the export has to run in a script or a CI pipeline, which Markloom doesn't do.

**Render the diagrams yourself.** Export each diagram as an image with the Mermaid CLI or [mermaid.live](https://mermaid.live), link the images from your Markdown, and convert. It works with any converter, but you have to repeat it each time a diagram changes.

**Paste into Word.** If you only need the content in an existing Word file, [Copy as rich text](../paste-markdown-into-confluence-google-docs-email/) pastes it formatted, diagrams included.

## Questions

**Can I export without opening the app, from the command line?** No. Markloom is an editor, so use Pandoc for that.

**Does it use my Word template or styles?** No. You get a clean document with Word's standard heading structure, and you can apply a template or theme to it in Word afterwards.

**What about PDF?** `Ctrl+E` and **PDF**. The desktop app saves a PDF directly, and the browser version opens the print dialog. Diagrams stay as vector graphics, so they stay sharp in print.
