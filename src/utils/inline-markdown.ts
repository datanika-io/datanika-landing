/**
 * Inline markdown (`code` and **bold**) in a plain string, rendered to HTML.
 *
 * For copy that is authored with backticks but rendered by a template rather
 * than by the markdown pipeline: tier summaries fetched from core, FAQ answers,
 * connector field descriptions, template prerequisites. Interpolated as text,
 * those strings show their backticks to the reader (landing#609).
 *
 * The input is HTML-escaped first, so the result is safe for `set:html`
 * whatever the string contains: a `<table>` placeholder in a description renders
 * as text instead of being parsed as a tag. Only `&`, `<` and `>` are escaped,
 * which is all element content needs.
 *
 * tests/inline-markdown.test.ts holds the renderer to that, and sweeps dist/
 * for inline markdown that reached a page unrendered.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderInline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
