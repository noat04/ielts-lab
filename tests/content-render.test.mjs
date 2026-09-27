import test from "node:test";
import assert from "node:assert/strict";
import { parseInlineMarkdown, sanitizeArticleHtml } from "../lib/content-render.ts";

test("inline markdown recognizes bold and safe links", () => {
  const tokens = parseInlineMarkdown("Read **carefully** at [IELTS](https://example.com).");
  assert.deepEqual(tokens.map((token) => token.type), ["text", "strong", "text", "link", "text"]);
  assert.equal(tokens[3].href, "https://example.com");
});

test("HTML sanitizer removes executable markup and unsafe attributes", () => {
  const html = sanitizeArticleHtml('<h2 onclick="alert(1)">Tip</h2><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://example.com">safe</a>');
  assert.equal(html.includes("script"), false);
  assert.equal(html.includes("onclick"), false);
  assert.equal(html.includes("javascript:"), false);
  assert.match(html, /href="https:\/\/example\.com"/);
});
