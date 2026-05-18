import type { FixtureMetadata } from "@ai-fix-runner/shared";

export const FIXTURE_CATALOG: FixtureMetadata[] = [
  {
    id: "invoice-calculator-bug",
    name: "Invoice Calculator Bug",
    description:
      "A tiny TS library that computes invoice totals. The buggy version rounds each line item early and applies tax before discount.",
    language: "TypeScript",
    expectedFailingArea: "src/calculateInvoice.ts — order of operations and rounding",
    defaultCommands: {
      install: ["npm", "install"],
      test: ["npm", "test"],
      build: ["npm", "run", "build"],
    },
  },
  {
    id: "markdown-parser-bug",
    name: "Markdown Parser Bug",
    description:
      "A small markdown-to-HTML parser. The buggy version treats any hyphen inside a sentence as a list marker and mishandles the closing fence of code blocks.",
    language: "TypeScript",
    expectedFailingArea: "src/parser.ts — list detection and fenced-code state machine",
    defaultCommands: {
      install: ["npm", "install"],
      test: ["npm", "test"],
      build: ["npm", "run", "build"],
    },
  },
  {
    id: "todo-api-bug",
    name: "Todo API Bug",
    description:
      "An Express todo API. The buggy version's PATCH returns the stale object before the update and doesn't validate the `completed` field or empty titles.",
    language: "TypeScript",
    expectedFailingArea: "src/app.ts — PATCH validation and stale response",
    defaultCommands: {
      install: ["npm", "install"],
      test: ["npm", "test"],
      build: ["npm", "run", "build"],
    },
  },
];

export const FIXTURE_IDS: ReadonlySet<string> = new Set(
  FIXTURE_CATALOG.map((f) => f.id),
);
