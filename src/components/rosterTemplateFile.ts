import { saveExportFile } from "../v2/desktop";
import {
  rosterGuideRows,
  rosterTemplateCsv,
  rosterTemplateHeaders,
  rosterTemplateRows,
} from "../storage/rosterTemplate";

/**
 * 花名册模板的文件生成。
 *
 * 与 RosterPane 分开放，是为了能在 node 里直接跑单元测试：
 * 组件只负责把生成的 Blob 存到本地。
 */

export const TEMPLATE_BASE_NAME = "班主任工作台-花名册模板";

export function rosterTemplateCsvBlob(): Blob {
  return new Blob([rosterTemplateCsv()], { type: "text/csv;charset=utf-8" });
}

/**
 * 生成 XLSX 模板：第一张表只有表头，示例值一律放第二张表。
 *
 * 不预置空行：SheetJS 会丢掉空值单元格，写了也留不住；
 * 而留一列「示例-张三」这类假数据，反而有被当真名册导入的风险。
 * 学号 / 身份证号的文本格式要求写在「字段说明」里。
 */
export async function buildRosterTemplateWorkbook(): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const headers = rosterTemplateHeaders();
  const sheet = XLSX.utils.aoa_to_sheet(rosterTemplateRows());
  sheet["!cols"] = headers.map((header) => ({
    wch: Math.max(11, Math.round(header.length * 2.1)),
  }));
  XLSX.utils.book_append_sheet(book, sheet, "花名册");
  const guide = XLSX.utils.aoa_to_sheet(rosterGuideRows());
  guide["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 60 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(book, guide, "字段说明");
  return XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

/**
 * 保存模板文件。
 *
 * 浏览器走 Blob 下载；打包成桌面 App 后 WebView 不响应 `<a download>`，
 * 改由桌面桥写入「下载」目录并返回路径（供界面提示）。
 */
export async function saveBlob(
  blob: Blob,
  fileName: string,
): Promise<string | undefined> {
  return saveExportFile(fileName, blob);
}
