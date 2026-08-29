import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAdrNumber, adrTemplate, lintAdr, lintCrossRefs } from "./adr-lib.mjs";

test("@important allocates above the highest existing number, never filling a gap", () => {
  assert.equal(nextAdrNumber([]), "0001");
  assert.equal(nextAdrNumber(["0001-a.md", "0003-c.md"]), "0004");
  assert.equal(nextAdrNumber(["0001-a.md", "README.md", "notes.txt"]), "0002");
});

test("@important a heading whose number disagrees with the filename is reported", () => {
  const t = adrTemplate({ number: "0007", title: "x", date: "2026-07-28" });
  const found = lintAdr(t, "0008-x.md");
  assert.equal(found.length, 1);
  assert.match(found[0].problem, /0008/);
});

test("@important a missing section is reported by name", () => {
  const t = adrTemplate({ number: "0007", title: "x", date: "2026-07-28" }).replace("## Consequences\n", "");
  assert.match(lintAdr(t, "0007-x.md")[0].problem, /Consequences/);
});

// Git checks these out with CRLF on Windows. An LF-only frontmatter pattern reported all three
// live ADRs as missing their status - found by running the deployed CLI, not by reading it.
test("@important CRLF frontmatter is read the same as LF", () => {
  const t = adrTemplate({ number: "0007", title: "x", date: "2026-07-28" }).replace(/\n/g, "\r\n");
  assert.deepEqual(lintAdr(t, "0007-x.md"), []);
});

test("@important cross-references are checked in both directions", () => {
  const adrs = [{ file: "0001-a.md", id: "ADR-0001", text: "see RISK-SUP-009 and ADR-0002" }];
  const found = lintCrossRefs({ adrs, riskIds: ["RISK-SUP-001"] });
  assert.equal(found.length, 2);
  assert.ok(found.some((f) => /RISK-SUP-009/.test(f.problem)));
  assert.ok(found.some((f) => /ADR-0002/.test(f.problem)));
});

// NEO4J is a live prefix and carries a digit; [A-Z]+ would silently skip those references.
test("@important a prefix containing a digit is still recognised", () => {
  const adrs = [{ file: "0001-a.md", id: "ADR-0001", text: "see RISK-NEO4J-004" }];
  assert.deepEqual(lintCrossRefs({ adrs, riskIds: ["RISK-NEO4J-004"] }), []);
  assert.equal(lintCrossRefs({ adrs, riskIds: [] }).length, 1);
});
