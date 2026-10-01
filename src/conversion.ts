const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function markdownToHtml(markdown: string): string {
  const escaped = escapeHtml(markdown);
  return escaped.split(/\n{2,}/).map((part) => `<p>${part.replace(/\n/g, '<br>')}</p>`).join('');
}
export function htmlToMarkdown(html: string): string {
  const element = document.createElement('div'); element.innerHTML = html;
  element.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  element.querySelectorAll('p,div,h1,h2,h3,li,blockquote').forEach((node) => node.append('\n\n'));
  return (element.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}
export function selectFields(fields: Record<string, unknown>, selected: string[]): Record<string, unknown> { return Object.fromEntries(selected.filter((key) => key in fields).map((key) => [key, fields[key]])); }
