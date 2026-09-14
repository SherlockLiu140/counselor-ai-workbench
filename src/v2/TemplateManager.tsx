import { useState, type FormEvent } from "react";
import { saveExportFile } from "./desktop";
import type { ConversationTemplate } from "./types";

function templateDefaults(
  template?: ConversationTemplate,
): ConversationTemplate {
  return {
    id: template?.id ?? `conversation-template:${crypto.randomUUID()}`,
    name: template?.name ?? "",
    scenario: template?.scenario ?? "日常关心",
    preTalkChecklist: template?.preTalkChecklist ?? ["查看最近事件和待办"],
    talkDirections: template?.talkDirections ?? [
      "先核对事实",
      "听取学生表达",
      "共同确定后续事项",
    ],
    outputStructure: template?.outputStructure ?? [
      "基本情况",
      "学生主要表达",
      "班主任沟通与引导",
      "后续跟进事项",
    ],
    writingStyle: template?.writingStyle ?? "客观、自然，不添加未提供的事实。",
    customPromptRules: template?.customPromptRules ?? "",
    defaultLength: template?.defaultLength ?? 300,
    tone: template?.tone ?? "自然",
    person: template?.person ?? "第三人称",
    commonOpening: template?.commonOpening ?? "",
    commonEnding: template?.commonEnding ?? "",
    highlightStudentExpression: template?.highlightStudentExpression ?? true,
    highlightCounselorGuidance: template?.highlightCounselorGuidance ?? true,
    highlightFollowUp: template?.highlightFollowUp ?? true,
    dividedParagraphs: template?.dividedParagraphs ?? true,
    favorite: template?.favorite ?? false,
    isDefault: template?.isDefault ?? false,
    createdByUser: template?.createdByUser ?? true,
  };
}

export function TemplateManager({
  templates,
  onCommit,
}: {
  templates: ConversationTemplate[];
  onCommit: (templates: ConversationTemplate[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState<ConversationTemplate>();
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = templateDefaults(editing);
    next.name = String(data.get("name"));
    next.scenario = String(data.get("scenario"));
    next.defaultLength = Number(data.get("defaultLength") || 300);
    next.tone = String(data.get("tone")) as ConversationTemplate["tone"];
    next.person = String(data.get("person")) as ConversationTemplate["person"];
    next.commonOpening = String(data.get("opening"));
    next.commonEnding = String(data.get("ending"));
    next.talkDirections = String(data.get("directions"))
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    next.writingStyle = String(data.get("rules"));
    next.customPromptRules = String(data.get("customRules"));
    next.highlightStudentExpression = data.get("student") === "on";
    next.highlightCounselorGuidance = data.get("guidance") === "on";
    next.highlightFollowUp = data.get("followUp") === "on";
    next.dividedParagraphs = data.get("divided") === "on";
    const updated = templates.some((item) => item.id === next.id)
      ? templates.map((item) => (item.id === next.id ? next : item))
      : [...templates, next];
    await onCommit(updated);
    setEditing(undefined);
    setMessage("模板已保存。");
  }
  async function download() {
    const payload = JSON.stringify(
      { schema: "counselor-conversation-templates-v2", templates },
      null,
      2,
    );
    try {
      const path = await saveExportFile(
        "班主任谈话模板包.json",
        payload,
        "application/json;charset=utf-8",
      );
      setMessage(
        path
          ? `模板包已保存到下载文件夹：${path.split(/[\\/]/).pop()}`
          : "模板包已下载。",
      );
    } catch (e) {
      setMessage(`模板包保存失败：${(e as Error).message}`);
    }
  }
  async function importFile(file: File) {
    const parsed = JSON.parse(await file.text()) as {
      schema?: string;
      templates?: ConversationTemplate[];
    };
    if (
      parsed.schema !== "counselor-conversation-templates-v2" ||
      !Array.isArray(parsed.templates)
    )
      throw new Error("不是有效的谈话模板包。 ");
    const imported = parsed.templates.map((item) => ({
      ...templateDefaults(item),
      id: `conversation-template:${crypto.randomUUID()}`,
      isDefault: false,
      createdByUser: true,
    }));
    await onCommit([...templates, ...imported]);
    setMessage(`已导入 ${imported.length} 个模板。`);
  }
  return (
    <section className="panel talk-template-library">
      <div className="section-title">
        <div>
          <h2>个人谈话模板</h2>
          <p>我按我的习惯谈，系统按我的习惯写。</p>
        </div>
        <div className="button-row">
          <button onClick={() => setEditing(templateDefaults())}>新建</button>
          <button onClick={() => void download()}>导出 JSON</button>
          <label className="template-file-button">
            导入 JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void importFile(file).catch((error) =>
                    setMessage((error as Error).message),
                  );
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="template-cards">
        {templates.map((template) => (
          <article
            key={template.id}
            className={template.isDefault ? "default" : ""}
          >
            <div>
              <span className="badge">
                {template.createdByUser ? "个人模板" : "场景模板"}
              </span>
              {template.favorite && <span className="badge amber">已收藏</span>}
            </div>
            <h3>{template.name}</h3>
            <p>
              {template.scenario} · {template.tone ?? "自然"} ·{" "}
              {template.defaultLength ?? 300} 字 ·{" "}
              {template.person ?? "第三人称"}
            </p>
            <small>{template.writingStyle}</small>
            <div className="button-row">
              <button onClick={() => setEditing(templateDefaults(template))}>
                编辑
              </button>
              <button
                onClick={() =>
                  void onCommit(
                    templates.map((item) => ({
                      ...item,
                      isDefault: item.id === template.id,
                    })),
                  )
                }
              >
                设为默认
              </button>
              <button
                onClick={() =>
                  void onCommit(
                    templates.map((item) =>
                      item.id === template.id
                        ? { ...item, favorite: !item.favorite }
                        : item,
                    ),
                  )
                }
              >
                {template.favorite ? "取消收藏" : "收藏"}
              </button>
              <button
                onClick={() =>
                  setEditing({
                    ...templateDefaults(template),
                    id: `conversation-template:${crypto.randomUUID()}`,
                    name: `${template.name}（副本）`,
                    createdByUser: true,
                    isDefault: false,
                  })
                }
              >
                复制
              </button>
              {template.createdByUser && (
                <button
                  className="danger"
                  onClick={() => {
                    const remaining = templates.filter(
                      (item) => item.id !== template.id,
                    );
                    if (template.isDefault && remaining[0])
                      remaining[0] = { ...remaining[0], isDefault: true };
                    void onCommit(remaining);
                  }}
                >
                  删除
                </button>
              )}
            </div>
            {template.isDefault && <strong>当前默认</strong>}
          </article>
        ))}
      </div>
      {editing && (
        <div className="modal-backdrop">
          <section
            className="modal template-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label="谈话模板编辑"
          >
            <div className="section-title">
              <div>
                <span className="eyebrow">PERSONAL TEMPLATE</span>
                <h2>
                  {templates.some((item) => item.id === editing.id)
                    ? "编辑模板"
                    : "新建模板"}
                </h2>
              </div>
              <button aria-label="关闭" onClick={() => setEditing(undefined)}>
                ×
              </button>
            </div>
            <form onSubmit={(event) => void save(event)}>
              <div className="field-grid two">
                <label>
                  模板名称
                  <input name="name" required defaultValue={editing.name} />
                </label>
                <label>
                  适用场景
                  <input
                    name="scenario"
                    required
                    defaultValue={editing.scenario}
                  />
                </label>
                <label>
                  默认字数
                  <input
                    name="defaultLength"
                    type="number"
                    min="100"
                    max="2000"
                    defaultValue={editing.defaultLength}
                  />
                </label>
                <label>
                  表达风格
                  <select name="tone" defaultValue={editing.tone}>
                    <option>正式</option>
                    <option>自然</option>
                    <option>简洁</option>
                  </select>
                </label>
                <label>
                  人称
                  <select name="person" defaultValue={editing.person}>
                    <option>第一人称</option>
                    <option>第三人称</option>
                  </select>
                </label>
                <label>
                  常用开头
                  <input name="opening" defaultValue={editing.commonOpening} />
                </label>
                <label>
                  常用结尾
                  <input name="ending" defaultValue={editing.commonEnding} />
                </label>
              </div>
              <label>
                谈话方向（每行一项）
                <textarea
                  name="directions"
                  defaultValue={editing.talkDirections.join("\n")}
                />
              </label>
              <label>
                写作规则
                <textarea name="rules" defaultValue={editing.writingStyle} />
              </label>
              <label>
                自定义要求
                <textarea
                  name="customRules"
                  defaultValue={editing.customPromptRules}
                />
              </label>
              <div className="check-row">
                <label className="check">
                  <input
                    type="checkbox"
                    name="student"
                    defaultChecked={editing.highlightStudentExpression}
                  />
                  突出学生表达
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="guidance"
                    defaultChecked={editing.highlightCounselorGuidance}
                  />
                  突出班主任引导
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="followUp"
                    defaultChecked={editing.highlightFollowUp}
                  />
                  突出后续跟进
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="divided"
                    defaultChecked={editing.dividedParagraphs}
                  />
                  输出分段
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setEditing(undefined)}>
                  取消
                </button>
                <button className="primary" type="submit">
                  保存模板
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
