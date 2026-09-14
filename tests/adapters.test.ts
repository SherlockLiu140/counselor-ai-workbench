import { expect, it } from "vitest";
import {
  decodeText,
  parseDocument,
  validateArchive,
  validateFile,
  validateText,
} from "../src/adapters/document";
import { docxFixture, xlsxFixture, utf8 } from "./fixtures";
import { demoScenarios } from "../src/demo/data";
const file = (name: string, bytes: Uint8Array) =>
  new File([new Uint8Array(bytes)], name);
it("parses UTF-8 TXT locally", async () =>
  expect(
    (await parseDocument(file("虚构.txt", utf8(demoScenarios[0].text)))).text,
  ).toContain("陈晨"));
it("parses quoted multiline CSV without losing values", async () => {
  const doc = await parseDocument(
    file(
      "虚构.csv",
      utf8('姓名,学号,备注\r\n陈晨,20260003,"课程,下降\n待了解"'),
    ),
  );
  expect(doc.tables[0].rows[1][2]).toContain("课程,下降\n待了解");
});
it("preserves leading zeros in CSV", async () =>
  expect(
    (await parseDocument(file("虚构.csv", utf8("姓名,学号\n陈晨,0003"))))
      .tables[0].rows[1][1],
  ).toBe("0003"));
it("parses XLSX rows with local bundled library", async () =>
  expect(
    (await parseDocument(file("虚构.xlsx", xlsxFixture()))).tables[0].rows,
  ).toHaveLength(31));
it("parses DOCX text without rendering embedded HTML", async () =>
  expect(
    (await parseDocument(file("虚构.docx", docxFixture()))).text,
  ).toContain("陈晨"));
it.each(["原始.doc", "扫描.png", "文件.exe"])(
  "rejects unsupported %s",
  (name) => expect(() => validateFile({ name, size: 10 })).toThrow("不支持"),
);
it("rejects zero size", () =>
  expect(() => validateFile({ name: "空.txt", size: 0 })).toThrow("为空"));
it("rejects oversized file", () =>
  expect(() =>
    validateFile({ name: "大.txt", size: 11 * 1024 * 1024 }),
  ).toThrow("10 MB"));
it("rejects broken archive", async () =>
  await expect(parseDocument(file("坏.docx", utf8("invalid")))).rejects.toThrow(
    "格式",
  ));
it("rejects fake PDF", async () =>
  await expect(parseDocument(file("坏.pdf", utf8("invalid")))).rejects.toThrow(
    "文件头",
  ));
it("rejects invalid UTF-8 explicitly", () =>
  expect(() => decodeText(new Uint8Array([255, 255, 0]))).toThrow("编码"));
it("rejects empty text", () =>
  expect(() => validateText("  \n")).toThrow("有效文本"));
it("rejects too much pasted text", () =>
  expect(() => validateText("x".repeat(300001))).toThrow("30 万"));
it("rejects incomplete ZIP", () =>
  expect(() => validateArchive(new Uint8Array([0x50, 0x4b, 1]))).toThrow(
    "不完整",
  ));
