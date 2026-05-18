// BROKEN VERSION — intentional bugs:
//   1. ANY line containing a "-" is treated as a list item (breaks "well-known").
//   2. The fenced-code state machine triggers on substring match for "```" and
//      forgets to `continue` after the closing fence, so the closing fence
//      itself gets emitted as a paragraph.
// The repair engine will replace this file with a corrected version.
export function parseMarkdown(input: string): string {
  const lines = input.split("\n");
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  let codeLines: string[] = [];

  function closeList(): void {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  }

  function flushCode(): void {
    out.push("<pre><code>" + codeLines.join("\n") + "</code></pre>");
    codeLines = [];
  }

  for (const line of lines) {
    // BUG: substring match instead of strict start-of-line match
    if (line.includes("```")) {
      if (inCode) {
        inCode = false;
        flushCode();
        // BUG: missing `continue` — the closing fence is then re-processed below
      } else {
        closeList();
        inCode = true;
        continue;
      }
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (line.trim() === "") {
      closeList();
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      out.push("<h1>" + line.slice(2) + "</h1>");
      continue;
    }
    // BUG: any line containing a hyphen becomes a list item
    if (line.includes("-")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push("<li>" + line + "</li>");
      continue;
    }
    closeList();
    out.push("<p>" + line + "</p>");
  }
  if (inList) out.push("</ul>");
  if (inCode) flushCode();
  return out.join("");
}
