import { useState } from "react";
import { parseDocument, type Table } from "../adapters/document";
import {
  guessFields,
  parseRoster,
  rosterFields,
  type FieldMap,
} from "../storage/roster";
import { rosterHeaderIssues } from "../storage/rosterTemplate";
import {
  TEMPLATE_BASE_NAME,
  buildRosterTemplateWorkbook,
  rosterTemplateCsvBlob,
  saveBlob,
} from "./rosterTemplateFile";
import type { Student } from "../engine/types";

export function RosterPane({
  students,
  onImport,
  disabled,
  disabledMessage,
  onError,
}: {
  students: Student[];
  onImport: (s: Student[]) => Promise<void>;
  disabled: boolean;
  disabledMessage?: string;
  onError: (s: string) => void;
}) {
  const [tables, setTables] = useState<Table[]>([]);
  const [table, setTable] = useState(0);
  const [fields, setFields] = useState<FieldMap | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  async function load(file: File) {
    setBusy(true);
    try {
      if (!/\.(csv|xlsx)$/i.test(file.name))
        throw new Error("花名册请选择 CSV 或 XLSX。");
      const doc = await parseDocument(file);
      setTables(doc.tables);
      setTable(0);
      setFields(guessFields(doc.tables[0]?.rows[0] ?? []));
    } catch (e) {
      setTables([]);
      setFields(null);
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  /** CSV 模板：表头与字段名同源，Excel / WPS 双击即可打开。 */
  async function downloadCsv() {
    try {
      const path = await saveBlob(
        rosterTemplateCsvBlob(),
        `${TEMPLATE_BASE_NAME}.csv`,
      );
      setSaved(path ? `模板已保存：${path.split(/[\\/]/).pop()}` : "模板已下载。");
    } catch (e) {
      onError(`模板保存失败：${(e as Error).message}`);
    }
  }
  /** XLSX 模板：「花名册」只有表头，「字段说明」写清必填与写法。 */
  async function downloadXlsx() {
    try {
      const output = await buildRosterTemplateWorkbook();
      const path = await saveBlob(
        new Blob([output], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `${TEMPLATE_BASE_NAME}.xlsx`,
      );
      setSaved(path ? `模板已保存：${path.split(/[\\/]/).pop()}` : "模板已下载。");
    } catch (e) {
      onError(`模板保存失败：${(e as Error).message}`);
    }
  }
  const headers = tables[table]?.rows[0] ?? [];
  const issues = rosterHeaderIssues(headers);
  const recognized = Object.values(fields ?? {}).filter((index) => index >= 0).length;
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>本地花名册</h2>
          <p>
            已导入 {students.length}{" "}
            名学生；支持多个班级。以学号建立身份，姓名用于精确匹配。
          </p>
        </div>
        <div className="roster-actions">
          <button onClick={() => void downloadXlsx()}>下载导入模板（XLSX）</button>
          <button onClick={downloadCsv}>下载 CSV 模板</button>
        </div>
      </div>
      {saved && (
        <p className="notice" role="status">
          {saved}
        </p>
      )}
      <p className="template-hint">
        模板表头就是系统字段名，请勿改列名；每个字段填什么、示例是什么，看模板里的「字段说明」工作表。
        学号、身份证号、手机号建议先把整列设成「文本」格式再填，否则 Excel 会写成 1.234E+10，导入时会报「学号格式不支持」。
      </p>
      {disabled ? (
        <p className="notice">
          {disabledMessage ??
            "演示模式使用 30 名虚构学生，禁止导入或读取真实花名册。"}
        </p>
      ) : (
        <label className="file-button">
          {busy ? "正在本地解析…" : "选择花名册 CSV / XLSX"}
          <input
            aria-label="导入花名册"
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void load(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {fields && !disabled && (
        <>
          <label>
            工作表
            <select
              value={table}
              onChange={(e) => {
                const index = Number(e.target.value);
                setTable(index);
                setFields(guessFields(tables[index].rows[0] ?? []));
              }}
            >
              {tables.map((t, i) => (
                <option key={i} value={i}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            字段映射预览：已根据表头识别 {recognized} / {Object.keys(rosterFields).length} 个字段。请检查后再导入；相同学号会更新本地资料并保留代号。
          </p>
          {(issues.unknown.length > 0 || issues.duplicated.length > 0) && (
            <p className="notice" role="status">
              {issues.unknown.length > 0 &&
                `以下列名系统认不出，导入时会被整列忽略：${issues.unknown.join("、")}。`}
              {issues.unknown.length > 0 && issues.duplicated.length > 0 && " "}
              {issues.duplicated.length > 0 &&
                `以下列名重复，只有第一列生效：${issues.duplicated.join("、")}。`}
            </p>
          )}
          <div className="field-grid">
            {Object.entries(rosterFields).map(([key, label]) => (
              <label key={key}>
                {label}
                {["name", "studentId"].includes(key) ? " *" : ""}
                <select
                  aria-label={`花名册${label}列`}
                  value={fields[key as keyof FieldMap]}
                  onChange={(e) =>
                    setFields({ ...fields, [key]: Number(e.target.value) })
                  }
                >
                  <option value={-1}>不导入</option>
                  {tables[table].rows[0]?.map((header, i) => (
                    <option key={i} value={i}>
                      {header || `第 ${i + 1} 列`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {tables[table].rows[0]?.map((cell, i) => (
                    <th key={i}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tables[table].rows.slice(1, 4).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const parsed = parseRoster(tables[table].rows, fields);
                if (parsed.length > 5000)
                  throw new Error("单次花名册最多 5000 人，请拆分。");
                await onImport(parsed);
                setTables([]);
                setFields(null);
              } catch (e) {
                onError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            确认字段并本地导入
          </button>
        </>
      )}
      {!students.length && (
        <p className="empty">
          尚无花名册。姓名识别依赖花名册，规则识别不能替代完整名单。
        </p>
      )}
    </section>
  );
}
