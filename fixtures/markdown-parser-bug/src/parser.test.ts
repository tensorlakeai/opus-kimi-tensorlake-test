import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./parser.js";

describe("parseMarkdown", () => {
  it("parses h1 headings", () => {
    expect(parseMarkdown("# Hello")).toBe("<h1>Hello</h1>");
  });

  it("parses paragraphs", () => {
    expect(parseMarkdown("Just a paragraph")).toBe("<p>Just a paragraph</p>");
  });

  it("parses unordered lists", () => {
    expect(parseMarkdown("- one\n- two")).toBe(
      "<ul><li>one</li><li>two</li></ul>",
    );
  });

  it("does not treat sentence hyphen as a list marker", () => {
    expect(parseMarkdown("well-known fact")).toBe(
      "<p>well-known fact</p>",
    );
  });

  it("preserves fenced code block content", () => {
    const input = "```\nlet x = 1;\nlet y = 2;\n```";
    expect(parseMarkdown(input)).toBe(
      "<pre><code>let x = 1;\nlet y = 2;</code></pre>",
    );
  });

  it("closes list before paragraph", () => {
    expect(parseMarkdown("- one\nparagraph")).toBe(
      "<ul><li>one</li></ul><p>paragraph</p>",
    );
  });

  it("handles blank lines between paragraphs", () => {
    expect(parseMarkdown("first\n\nsecond")).toBe(
      "<p>first</p><p>second</p>",
    );
  });
});
