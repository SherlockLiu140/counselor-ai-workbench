import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { guessFields, rosterFields } from "../src/storage/roster";
import {
  missingGuideFields,
  rosterGuideRows,
  rosterHeaderIssues,
  rosterTemplateCsv,
  rosterTemplateHeaders,
  rosterTemplateRows,
} from "../src/storage/rosterTemplate";
import { buildRosterTemplateWorkbook } from "../src/components/rosterTemplateFile";

describe("花名册导入模板", () => {
  it("表头与 rosterFields 同源，且能被 guessFields 全部识别", () => {
    const headers = rosterTemplateHeaders();
    expect(headers).toEqual(Object.values(rosterFields));
    const guessed = guessFields(headers);
    expect(Object.values(guessed).filter((index) => index >= 0)).toHaveLength(
      Object.keys(rosterFields).length,
    );
  });

  it("模板只有表头：示例值不能混进花名册，否则会被当成真人导入", () => {
    const rows = rosterTemplateRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(rosterTemplateHeaders());
  });

  it("字段说明覆盖每一个字段，新增字段忘了写说明会被这条用例拦下", () => {
    expect(missingGuideFields()).toEqual([]);
    const rows = rosterGuideRows();
    expect(rows[0]).toEqual(["字段（表头请勿改名）", "是否必填", "填写说明", "示例值"]);
    expect(rows.slice(1).map((row) => row[0])).toEqual(rosterTemplateHeaders());
    // 姓名与学号必须标成必填，其余都是选填
    const required = rows.slice(1).filter((row) => row[1] === "必填").map((row) => row[0]);
    expect(required).toEqual(["姓名", "学号"]);
  });

  it("CSV 模板带 BOM，且首行就是模板表头", () => {
    const csv = rosterTemplateCsv();
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")[0].replace("\uFEFF", "")).toBe(
      rosterTemplateHeaders().join(","),
    );
  });

  it("XLSX 模板：第一张表是花名册（只有表头），第二张表是字段说明", async () => {
    const output = await buildRosterTemplateWorkbook();
    const book = XLSX.read(output, { type: "array", cellText: true });
    expect(book.SheetNames).toEqual(["花名册", "字段说明"]);

    const headers = XLSX.utils.sheet_to_json<string[]>(book.Sheets["花名册"], {
      header: 1,
      blankrows: false,
    });
    expect(headers).toHaveLength(1);
    expect(headers[0]).toEqual(rosterTemplateHeaders());

    const guide = XLSX.utils.sheet_to_json<string[]>(book.Sheets["字段说明"], {
      header: 1,
      blankrows: false,
    });
    expect(guide).toEqual(rosterGuideRows());

    // 模板里不能有假数据行，否则可能被当成真人导入
    expect(rosterHeaderIssues(headers[0])).toEqual({ unknown: [], duplicated: [] });
  });

  it("导入前的列名体检：认不出的列与重复列都要报出来，序号这类辅助列不算", () => {
    expect(rosterHeaderIssues(rosterTemplateHeaders())).toEqual({
      unknown: [],
      duplicated: [],
    });
    expect(
      rosterHeaderIssues(["序号", "姓名", "学号", "手机号码", "辅导员评语", "姓名"]),
    ).toEqual({ unknown: ["辅导员评语"], duplicated: ["姓名"] });
  });
});
