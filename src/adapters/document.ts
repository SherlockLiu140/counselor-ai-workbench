export interface Table {
  name: string;
  rows: string[][];
}
export interface LocalDocument {
  kind: "txt" | "csv" | "xlsx" | "docx" | "pdf";
  text: string;
  tables: Table[];
  warnings: string[];
}
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 300_000;
export function validateFile(file: Pick<File, "name" | "size">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["txt", "csv", "xlsx", "docx", "pdf"].includes(extension ?? ""))
    throw new Error(
      "不支持此文件类型。请选择 TXT、CSV、XLSX、DOCX 或可提取文本的 PDF；不支持 .doc、图片或 OCR。",
    );
  if (!file.size) throw new Error("文件为空，请选择包含内容的文件。");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("文件超过 10 MB，请拆分后在本地导入。");
  return extension as LocalDocument["kind"];
}
export function validateText(text: string) {
  if (!text.trim()) throw new Error("未提取到有效文本。");
  if (text.length > MAX_TEXT_LENGTH)
    throw new Error("文本超过 30 万字符，请拆分后处理。");
  return text;
}
export function decodeText(bytes: Uint8Array) {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  try {
    return new TextDecoder(encoding, { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    throw new Error(
      "文本编码无法识别，请另存为 UTF-8 或带 BOM 的 UTF-16 后重试。",
    );
  }
}
// Bound advertised uncompressed ZIP size before document libraries allocate entries.
export function validateArchive(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error("文档格式与扩展名不符或文件损坏。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0,
    count = 0;
  for (let i = 0; i + 46 <= bytes.length; i++)
    if (view.getUint32(i, true) === 0x02014b50) {
      total += view.getUint32(i + 24, true);
      count++;
      if (total > 50 * 1024 * 1024 || count > 5000)
        throw new Error("文档解压规模过大，请拆分或另存为纯文本。");
      i +=
        45 +
        view.getUint16(i + 28, true) +
        view.getUint16(i + 30, true) +
        view.getUint16(i + 32, true);
    }
  if (!count) throw new Error("文档压缩结构不完整。");
}
export async function parseDocument(file: File): Promise<LocalDocument> {
  const kind = validateFile(file);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const document: LocalDocument = { kind, text: "", tables: [], warnings: [] };
  try {
    if (kind === "txt") document.text = decodeText(bytes);
    if (kind === "csv" || kind === "xlsx") {
      if (kind === "xlsx") validateArchive(bytes);
      const XLSX = await import("xlsx");
      const workbook =
        kind === "csv"
          ? XLSX.read(decodeText(bytes), { type: "string", raw: true })
          : XLSX.read(buffer, {
              type: "array",
              cellFormula: false,
              cellHTML: false,
              cellText: true,
            });
      if (workbook.SheetNames.length > 50)
        throw new Error("工作表超过 50 张，请拆分后导入。");
      document.tables = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
        if ((range.e.r + 1) * (range.e.c + 1) > 200_000)
          throw new Error("表格单元格过多，请缩小有效区域。");
        return {
          name,
          rows: XLSX.utils
            .sheet_to_json<string[]>(sheet, {
              header: 1,
              raw: false,
              defval: "",
              blankrows: false,
            })
            .map((row) => row.map((cell) => String(cell))),
        };
      });
      // Sheet names can contain personal information, so include them in the source sent through review.
      document.text = document.tables
        .map(
          (table) =>
            `【工作表：${table.name}】\n${table.rows.map((row) => row.join("\t")).join("\n")}`,
        )
        .join("\n\n");
      document.warnings.push(
        "当前导出为脱敏 TXT；不保留公式、样式、批注、隐藏对象或原文件元数据。请复核表格阅读顺序。",
      );
    }
    if (kind === "docx") {
      validateArchive(bytes);
      const mammoth = await import("mammoth/mammoth.browser");
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      document.text = result.value;
      document.warnings.push(
        "仅提取正文文本，不承诺保留页眉页脚、文本框、图片、批注及修订内容。输出为新的 TXT，不包含原文件附件或元数据。",
      );
      if (result.messages.length)
        document.warnings.push(
          "解析器提示文档有未完全支持的内容，请与原文件核对。",
        );
    }
    if (kind === "pdf") {
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
        throw new Error("PDF 文件头无效。");
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const loading = pdfjs.getDocument({
        data: bytes,
        useSystemFonts: true,
        cMapUrl: "/pdf/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdf/standard_fonts/",
        wasmUrl: "/pdf/wasm/",
      });
      try {
        const pdf = await loading.promise;
        if (pdf.numPages > 200)
          throw new Error("PDF 超过 200 页，请拆分后处理。");
        const pages: string[] = [];
        let empty = 0;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const content = await page.getTextContent();
          const text = content.items
            .map((item) =>
              "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
            )
            .join("");
          if (!text.trim()) empty++;
          pages.push(text);
          page.cleanup();
          if (pages.reduce((sum, p) => sum + p.length, 0) > MAX_TEXT_LENGTH)
            throw new Error("文本超过 30 万字符，请拆分后处理。");
        }
        if (empty === pdf.numPages)
          throw new Error(
            "当前文件无法直接提取文本，请先转换为可检索文本版本。",
          );
        if (empty)
          document.warnings.push(
            `有 ${empty} 页未提取到文本，可能含扫描页；本次结果不包含这些页，请人工核对。`,
          );
        document.text = pages.join("\n\n");
        document.warnings.push(
          "PDF 按提取顺序转为文本；分栏、断字与未识别图片需人工检查。",
        );
      } finally {
        await loading.destroy();
      }
    }
    validateText(document.text);
    return document;
  } catch (error) {
    if (error instanceof Error)
      throw new Error(`本地解析失败：${error.message}`);
    throw new Error("本地解析失败，请检查文件是否损坏或加密。");
  }
}
