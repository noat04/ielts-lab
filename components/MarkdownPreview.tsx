import { parseInlineMarkdown, sanitizeArticleHtml } from "@/lib/content-render";

function InlineMarkdown({ value }: { value: string }) {
  return <>{parseInlineMarkdown(value).map((token, index) => token.type === "strong"
    ? <strong key={index}>{token.text}</strong>
    : token.type === "emphasis"
      ? <em key={index}>{token.text}</em>
      : token.type === "code"
        ? <code key={index}>{token.text}</code>
        : token.type === "link"
          ? <a key={index} href={token.href} target="_blank" rel="noreferrer">{token.text}</a>
          : <span key={index}>{token.text}</span>)}</>;
}

export function MarkdownPreview({ content, format = "markdown", compact = false }: { content: string; format?: "markdown" | "html"; compact?: boolean }) {
  if (format === "html") return <article className={`markdown-preview${compact ? " compact" : ""}`} dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(content) }}/>;
  return <article className={`markdown-preview${compact ? " compact" : ""}`}>{content.split(/\n/).map((line, index) => line.startsWith("### ") ? <h3 key={index}><InlineMarkdown value={line.slice(4)}/></h3> : line.startsWith("## ") ? <h2 key={index}><InlineMarkdown value={line.slice(3)}/></h2> : line.startsWith("# ") ? <h1 key={index}><InlineMarkdown value={line.slice(2)}/></h1> : line.startsWith("- ") ? <li key={index}><InlineMarkdown value={line.slice(2)}/></li> : line.startsWith("> ") ? <blockquote key={index}><InlineMarkdown value={line.slice(2)}/></blockquote> : <p key={index}>{line ? <InlineMarkdown value={line}/> : <br/>}</p>)}</article>;
}
