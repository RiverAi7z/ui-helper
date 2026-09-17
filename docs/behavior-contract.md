# Refactor behavior contract

Baseline: release `ef46f97` (v0.2.0). This records current behavior, including quirks;
refactoring is not permission to change it. Public shared exports, panel component
props, wire messages, manifest permissions, Chrome 116 minimum, Markdown output,
and `.ui-helper/recordings/` paths remain stable. No dependency upgrades.

## Annotation and DOM ownership

- Content owns live DOM references. Inspect excludes body/html and helper UI;
  ordinary full-viewport containers remain inspectable. Selection suppresses the
  page click. DOM identity distinguishes siblings; selector lookup is a fallback
  only after a node is disconnected.
- Save retains the annotation and edits. Reopening a saved annotation captures a
  baseline; Cancel restores that baseline. Cancel on an unsaved annotation removes
  it. Delete restores the original element and removes its annotation.
- Preview off restores original inline values **and priorities**, text (subject to
  the existing text-editability guard), and removes resize slots. Preview on
  reapplies edits. A replacement node receives saved edits while preview is on.
- Only leaf elements with nonblank text are text-editable. Clearing text can make
  the guard false; do not silently change this behavior during extraction.
- Resize keeps an inert footprint in flow and mutates the real node, retaining its
  listeners/canvas. Move/resize coordinates, pointer capture/cancellation, scale
  handling, and minimum dimensions must not change.
- Escape clears feedback and restores originals; while recording it requests a
  stop without the normal encode/save annotation flow.
- Closing/hiding the panel disables interception and recording options, but keeps
  page drafts. No page viewport/layout styles are changed to accommodate the panel.

## Recording

- The floating Window/Area/duration controls are page-owned; the native panel owns
  folder permission, editors, and file writing. Opening options first obtains a
  folder in the panel's direct user gesture. A tab change during the picker rejects
  starting in the new tab.
- Default limit: 20 seconds, bounded to 1–60. Text input uses `parseInt(...) || 20`;
  panel commands use `Math.round(...) || 20`. These are intentionally distinct.
- Capture uses 6 FPS, max output edge 960, even output dimensions, per-frame
  rgb444 palettes, no audio, and existing crop/letterbox rounding.
- Start/stop preserve an open element/region draft. Finishing encoding opens the
  GIF editor only if no annotation draft is selected at completion.
- Cancel GIF annotation restores its comment. Delete removes the session reference
  and marker, **not** the saved file. Saving writes the helper `.gitignore` first.

## Export and errors

- Export includes saved annotations only, plus all saved recording references.
  Empty export errors with `Add an annotation or recording first`.
- Keep Markdown ordering, whitespace, HTML compaction, redaction, rounding, text
  deltas, layout note, and `@.ui-helper/recordings/...gif` references unchanged.
- Copy requests export from a captured tab ID, writes clipboard, then sends
  `export-done` to that same tab. Clipboard failure must not reset the session.
- Successful `export-done` restores originals, clears annotations/recordings and
  selection, resets mode/preview, and displays `Copied`.
- Clipboard fallback to `execCommand` and Chrome callback APIs are compatibility
  paths, not obsolete code to delete in this refactor.

## Known coverage limitations

The `.profile-copy` parent cannot be selected where children cover its entire hit
area. Keep the native element-matrix skip explicit. Mock transport/capture checks
cannot establish activeTab, worker suspension, actual browser zoom, permission
picker, real GIF encoding, or native panel close/reopen parity.
