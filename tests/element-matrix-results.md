# Ego Lite element isolation matrix — after fix

Page: `http://127.0.0.1:5173/`
Runner: `tests/ego-element-matrix.js`

The built content script was tested with real mouse selection, movement,
resizing and Cancel in Ego Lite. Chrome extension messaging was stubbed; this
matrix does not test video capture. Each case starts from a fresh page.

- Move +25px horizontally / +15px vertically, then move back.
- Grow width by 40px and height by 20px using an unobstructed corner.
- Compare document-space rectangles of other rendered page elements, including
  ancestors but excluding descendants of the edited element and extension UI.
- Assert the selected element actually moved/resized, with 0.8px tolerance.
- Cancel must restore original geometry and DOM identity, leaving no resize slots.
- Any geometry change or unexpected test error fails the runner; the explicitly
  unselectable `.profile-copy` container is excluded from the pass count.

| Target                                     | Move isolated | Resize isolated | Cancel restores |
| ------------------------------------------ | ------------- | --------------- | --------------- |
| Heading (`h1`)                             | PASS          | PASS            | PASS            |
| Paragraph (`.hero-copy`)                   | PASS          | PASS            | PASS            |
| Flex button (`#theme-button`)              | PASS          | PASS            | PASS            |
| Flex text (`.type-large`)                  | PASS          | PASS            | PASS            |
| Grid swatch (`.swatch.coral`)              | PASS          | PASS            | PASS            |
| Block card (`.glass-card`)                 | PASS          | PASS            | PASS            |
| Outer box (`.margin-demo`)                 | PASS          | PASS            | PASS            |
| Padding box (`.padding-demo`)              | PASS          | PASS            | PASS            |
| Inner box (`.content-demo`)                | PASS          | PASS            | PASS            |
| Flex avatar (`.avatar`)                    | PASS          | PASS            | PASS            |
| Flex column text (`.profile-copy strong`)  | PASS          | PASS            | PASS            |
| Nested card (`.profile-card`)              | PASS          | PASS            | PASS            |
| Grid list item (`.metrics li:first-child`) | PASS          | PASS            | PASS            |
| Grid panel (`.color-panel`)                | PASS          | PASS            | PASS            |
| Grid navigation link (`.brand`)            | PASS          | PASS            | PASS            |
| Centered grid card (`.motion-card`)        | PASS          | PASS            | PASS            |
| Absolute decoration (`.orbit-two`)         | PASS          | PASS            | PASS            |
| Canvas (`#demo-canvas`)                    | PASS          | PASS            | PASS            |
| Inline emphasized text (`h1 em`)           | PASS          | PASS            | PASS            |
| Progress block (`.progress`)               | PASS          | PASS            | PASS            |

**20/20 moves, 20/20 resizes, 20/20 cancellations passed.** Before the fix,
10 of these resize cases changed neighboring/ancestor geometry.

Additional regression checks passed:

- `ego-flex-resize.js`: eight handles, movement, preview off/on and Cancel.
- `ego-grid-resize.js`: large northwest growth, shrinking, eight handles,
  movement and preview/Cancel without moving neighboring columns or cards.
- `ego-resize-lifecycle.js`: save/reopen, cancel back to saved size, repeated
  preview cycles, delete, pointer cancellation, export cleanup, original DOM
  identity and native click listener retention. Clipboard writes are stubbed.
- `ego-unique-annotation.js`: reselecting an element reuses its annotation.
- `ego-recording-edit.js`: editing while recording and draft preservation;
  recording/file APIs are mocked, not a GIF-output verification.

Implementation: an inert, aria-hidden shadow-DOM slot preserves the original
layout footprint while the real element is resized out of flow. The slot is
removed on preview-off, cancellation, deletion and export; the real element
is never replaced. Percentage-sized Canvas slots retain their percentage
contribution to Grid instead of becoming definite pixel-width grid items.

Coverage limits: `.profile-copy` itself cannot be directly mouse-selected
because its children cover its hit area (its `strong` child is tested).
The fixture has no image, input, table or iframe cases; arbitrary sites,
pseudo-element layout and complex rotated transforms are not covered by this
matrix. This report does not claim universal HTML/CSS support.
