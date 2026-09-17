import type { FeedbackSession } from "@ui-helper/shared";
import type { RecordingAsset } from "./panel-protocol";
import { compactHtml } from "./compact-html";

export function sessionId(): string {
  return `${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Formatting has no state effects; DOM compaction is an explicit dependency. */
export function buildMarkdown(
  session: FeedbackSession,
  recordings: RecordingAsset[],
  compact: (html: string) => string = compactHtml,
): string {
  const lines = ["# UI feedback", "", `Page: ${session.page.url}`, ""];
  for (const annotation of session.annotations) {
    if (annotation.target) {
      lines.push(`## ${annotation.index}. \`${annotation.target.selector}\``);
      if (annotation.comment) lines.push(annotation.comment, "");

      const textDelta = annotation.styleDeltas.find(
        (delta) => delta.property === "textContent",
      );
      if (textDelta)
        lines.push(
          `Text: \`${textDelta.before}\` → \`${textDelta.after}\``,
          "",
        );

      const styleChanges = annotation.styleDeltas.filter(
        (delta) => delta.property !== "textContent",
      );
      if (styleChanges.length) {
        lines.push("```css");
        for (const delta of styleChanges)
          lines.push(`${delta.property}: ${delta.before} → ${delta.after};`);
        lines.push("```", "");
      }

      lines.push("```html", compact(annotation.target.outerHTML), "```");
    } else if (annotation.region) {
      lines.push(`## ${annotation.index}. Region`);
      if (annotation.comment) lines.push(annotation.comment, "");
      lines.push(
        `Area: x=${Math.round(annotation.region.pageX)}, y=${Math.round(annotation.region.pageY)}, ${Math.round(annotation.region.width)}×${Math.round(annotation.region.height)}`,
      );
    }
    lines.push("");
  }

  recordings.forEach((recording, index) => {
    lines.push(`## Recording ${index + 1}`);
    if (recording.comment) lines.push(recording.comment, "");
    lines.push(`@${recording.relativePath}`);
    if (recording.region)
      lines.push(
        `Area: x=${Math.round(recording.region.pageX)}, y=${Math.round(recording.region.pageY)}, ${Math.round(recording.region.width)}×${Math.round(recording.region.height)}`,
      );
    lines.push("");
  });

  return lines.join("\n").trim();
}
