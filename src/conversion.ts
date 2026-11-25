const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Esiana's editor may store HTML entities in Markdown. Decode once before
// escaping so entities render correctly while source HTML stays inert.
function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const hex = entity[1]?.toLowerCase() === 'x';
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
  });
}
function inlineMarkdown(value: string): string {
  return escapeHtml(decodeEntities(value))
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/!\[([^\]\n]*)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, '<a href="$2">$1</a>');
}
export function markdownToHtml(markdown: string): string {
  const parts = markdown.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return parts.map((part) => {
    const lines = part.split('\n');
    if (lines.length === 1) {
      const heading = /^(#{1,6})\s+(.+)$/.exec(lines[0]);
      if (heading) return `<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`;
    }
    if (lines.every((line) => /^\s*[-*] /.test(line))) return `<ul>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inlineMarkdown).join('<br>')}</p>`;
  }).join('');
}
export function htmlToMarkdown(html: string): string {
  const element = document.createElement('div'); element.innerHTML = html;
  const serialize = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    const content = [...node.childNodes].map(serialize).join('');
    switch (node.tagName.toLowerCase()) {
      case 'br': return '\n';
      case 'strong': case 'b': return `**${content}**`;
      case 'em': case 'i': return `*${content}*`;
      case 'code': return `\`${content}\``;
      case 'a': return node.getAttribute('href') ? `[${content}](${node.getAttribute('href')})` : content;
      case 'img': return `![${node.getAttribute('alt') ?? ''}](${node.getAttribute('src') ?? ''})`;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return `${'#'.repeat(Number(node.tagName.slice(1)))} ${content}\n\n`;
      case 'li': return `- ${content.trim()}\n`;
      case 'p': case 'div': case 'blockquote': return `${content}\n\n`;
      default: return content;
    }
  };
  return [...element.childNodes].map(serialize).join('').replace(/\n{3,}/g, '\n\n').trim();
}
export function selectFields(fields: Record<string, unknown>, selected: string[]): Record<string, unknown> { return Object.fromEntries(selected.filter((key) => key in fields).map((key) => [key, fields[key]])); }
