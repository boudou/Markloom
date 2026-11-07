# Release plan

The order we ship in, and who signs off.

```mermaid
sequenceDiagram
  participant Dev
  participant Review
  participant Users
  Dev->>Review: Draft in Markdown
  Review-->>Dev: Comments on the Word export
  Dev->>Users: Publish the final PDF
```

## Checklist

- [x] Write the notes
- [x] Add the diagram
- [ ] Export for review
