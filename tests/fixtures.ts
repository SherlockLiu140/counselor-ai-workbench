import { zipSync, strToU8 } from "fflate";
import * as XLSX from "xlsx";
import { demoRosterRows, demoScenarios } from "../src/demo/data";
export const utf8 = (text: string) => new TextEncoder().encode(text);
export function docxFixture(text = demoScenarios[0].text) {
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  });
}
export function xlsxFixture(rows = demoRosterRows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet(rows),
    "虚构花名册",
  );
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
}
export function pdfFixture(blank = false) {
  const stream = blank
    ? ""
    : "BT /F1 12 Tf 72 700 Td (Fictional student 20260003 phone 13900000003) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => `${String(x).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return utf8(text);
}
