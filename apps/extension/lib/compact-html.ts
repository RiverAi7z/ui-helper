/** DOM-dependent compaction used by the page's Markdown exporter. */
export function compactHtml(html: string): string {
  const compact = html
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (compact.length <= 800) return compact;

  const template = document.createElement("template");
  template.innerHTML = compact;
  const element = template.content.firstElementChild;
  if (!element) return `${compact.slice(0, 797)}...`;

  const shallow = element.cloneNode(false) as Element;
  const text = element.textContent?.trim().replace(/\s+/g, " ") ?? "";
  shallow.textContent = text.length > 240 ? `${text.slice(0, 237)}...` : text;
  return shallow.outerHTML;
}
