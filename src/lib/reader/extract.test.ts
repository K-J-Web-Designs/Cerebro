import { describe, expect, it } from "vitest";
import {
  extractArticleFromHtml,
  isSafePublicHttpUrl,
  sanitizeReaderHtml,
} from "./extract";
import { extractArxivId } from "@/lib/research/arxiv";

describe("Read Later extraction & safety", () => {
  it("blocks localhost, private IP ranges, and non-http schemes", () => {
    expect(isSafePublicHttpUrl("https://arxiv.org/abs/2404.16130")).toBe(true);
    expect(isSafePublicHttpUrl("http://localhost:3000")).toBe(false);
    expect(isSafePublicHttpUrl("http://127.0.0.1/admin")).toBe(false);
    expect(isSafePublicHttpUrl("http://192.168.1.1")).toBe(false);
    expect(isSafePublicHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("extracts arXiv IDs from abs and pdf URLs", () => {
    expect(extractArxivId("https://arxiv.org/abs/2404.16130")).toBe("2404.16130");
    expect(extractArxivId("https://arxiv.org/pdf/2310.06825v2")).toBe("2310.06825v2");
    expect(extractArxivId("https://example.com/blog")).toBeNull();
  });

  it("strips scripts and inline event handlers from reader HTML", () => {
    const dirty = `<p onclick="alert(1)">Safe text</p><script>evil()</script><iframe src="x"></iframe>`;
    const clean = sanitizeReaderHtml(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("<iframe");
    expect(clean).not.toContain("onclick");
    expect(clean).toContain("Safe text");
  });

  it("extracts readable article title, text, and reading time from HTML", () => {
    const html = `
      <!doctype html>
      <html>
        <head><title>Knowledge Architecture Notes</title></head>
        <body>
          <article>
            <h1>Knowledge Architecture Notes</h1>
            <p>Researchers need tools that unify reading highlights, personal synthesis notes, and visual concept maps into a durable offline-capable workspace.</p>
            <p>Connecting semantic embeddings with explicit wikilinks creates resilient personal memory across projects.</p>
          </article>
        </body>
      </html>`;
    const extracted = extractArticleFromHtml(html, "https://example.com/notes");
    expect(extracted.title).toContain("Knowledge Architecture Notes");
    expect(extracted.contentText).toContain("wikilinks");
    expect(extracted.readingTimeMinutes).toBeGreaterThanOrEqual(1);
    expect(extracted.siteName).toBe("example.com");
  });
});
