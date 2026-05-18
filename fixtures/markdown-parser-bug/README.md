# markdown-parser-bug

A tiny markdown-to-HTML parser. **It ships intentionally broken.**

## The bug

`src/parser.ts` has two problems:

1. **List detection is too greedy.** Any line containing a `-` anywhere is treated as a list item. `"well-known fact"` becomes `<ul><li>well-known fact</li></ul>` instead of a paragraph.
2. **Fenced code blocks break on the closing fence.** The state machine matches `"```"` as a substring and forgets to `continue` after flushing the closing fence, so the fence itself gets emitted as a paragraph.

## Correct behavior

- `# Heading` → `<h1>Heading</h1>`
- A line of normal text → `<p>…</p>`
- A line starting with `- ` (hyphen + space) is a list item; consecutive items group into one `<ul>…</ul>`.
- Hyphens **inside** a sentence do not create lists.
- Code fences are opened and closed by lines starting with `` ``` ``. Content inside is preserved verbatim and wrapped in `<pre><code>…</code></pre>`.
- Blank lines separate paragraphs / close lists.

The repair engine replaces `src/parser.ts` with a corrected implementation.
