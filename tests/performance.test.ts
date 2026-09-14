import { expect, it } from "vitest";
import { parseDocument } from "../src/adapters/document";
import { detect, render } from "../src/engine/engine";
import { defaultOptions, type Context } from "../src/engine/types";

it("processes a dense near-limit text document within the main-thread budget", async () => {
  const source = "记录 13900009999\n".repeat(17_500);
  expect(source.length).toBeLessThan(300_000);
  const file = new File([source], "虚构大文档.txt", { type: "text/plain" });
  const started = performance.now();
  const document = await parseDocument(file);
  const context: Context = {
    text: document.text,
    students: [],
    codes: {},
    options: defaultOptions,
    customRules: [],
  };
  const findings = detect(context);
  const output = render(document.text, findings);
  const elapsed = performance.now() - started;

  expect(findings).toHaveLength(17_500);
  expect(output).not.toContain("13900009999");
  // This is a regression ceiling, not a claim about every device. The UI still
  // limits files and advises splitting; a Worker remains the long-term guard.
  expect(elapsed).toBeLessThan(2_000);
});
