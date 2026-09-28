export type InlineToken = { type: "text" | "strong" | "emphasis" | "code" | "link"; text: string; href?: string };

export function isSafeContentUrl(value: string) {
  return /^(https?:|mailto:|\/|#)/i.test(value.trim());
}

export function parseInlineMarkdown(value: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ type: "text", text: value.slice(cursor, index) });
    if (match[1]) tokens.push({ type: "strong", text: match[1] });
    else if (match[2]) tokens.push({ type: "emphasis", text: match[2] });
    else if (match[3]) tokens.push({ type: "code", text: match[3] });
    else if (isSafeContentUrl(match[5])) tokens.push({ type: "link", text: match[4], href: match[5].trim() });
    else tokens.push({ type: "text", text: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) tokens.push({ type: "text", text: value.slice(cursor) });
  return tokens;
}

const ALLOWED_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "ul", "ol", "li", "blockquote", "a", "br", "code", "pre", "table", "thead", "tbody", "tr", "th", "td"]);
const VOID_TAGS = new Set(["br"]);

export function sanitizeArticleHtml(value: string) {
  const withoutDangerousBlocks = value
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|svg|math)[^>]*>[^]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|svg|math)[^>]*\/?\s*>/gi, "");
  return withoutDangerousBlocks.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (full, rawTag: string, rawAttributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (full.startsWith("</")) return `</${tag}>`;
    const attributes: string[] = [];
    const attributePattern = /([a-zA-Z][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const match of rawAttributes.matchAll(attributePattern)) {
      const name = match[1].toLowerCase();
      const attributeValue = match[2] ?? match[3] ?? match[4] ?? "";
      if (name === "href" && tag === "a" && isSafeContentUrl(attributeValue)) attributes.push(`href="${escapeAttribute(attributeValue)}"`);
      if (["title", "colspan", "rowspan"].includes(name)) attributes.push(`${name}="${escapeAttribute(attributeValue)}"`);
    }
    if (tag === "a") attributes.push('target="_blank"', 'rel="noopener noreferrer"');
    return `<${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}${VOID_TAGS.has(tag) ? "/" : ""}>`;
  });
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
