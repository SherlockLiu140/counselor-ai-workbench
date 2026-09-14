import { useState } from "react";
import { aiDebugRecords, isAiDebugEnabled, type AiDebugRecord } from "./aiDebug";

/**
 * AI 请求调试面板（可折叠）。
 *
 * 只在开发模式 / 演示模式渲染；正式用户看不到。
 * **绝不显示 API Key**，也不显示任何密钥字段。
 */
export function AiDebugPanel() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  if (!isAiDebugEnabled()) return null;
  const records = aiDebugRecords();
  return (
    <section className="panel ai-debug" aria-label="AI 请求调试">
      <div className="section-title">
        <div>
          <span className="eyebrow">DEV / DEMO ONLY</span>
          <h2>AI 请求调试</h2>
          <p>
            仅用于排查「模型真正收到的是什么」。生产环境默认关闭，面板内不显示 API Key。
          </p>
        </div>
        <div className="button-row">
          <button onClick={() => force((value) => value + 1)}>刷新</button>
          <button onClick={() => setOpen(!open)}>
            {open ? "收起" : `展开（${records.length}）`}
          </button>
        </div>
      </div>
      {open &&
        (records.length ? (
          records.map((record, index) => (
            <DebugEntry key={`${record.at}-${index}`} record={record} />
          ))
        ) : (
          <p className="notice">
            还没有记录。走一次「交给 AI 成文 / 直接调用」后，这里会显示完整
            Prompt 与返回。
          </p>
        ))}
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="ai-debug-row">
      <span className="ai-debug-label">{label}</span>
      <span className="ai-debug-value">
        {value === undefined || value === "" ? "—" : String(value)}
      </span>
    </div>
  );
}

function Block({ label, text }: { label: string; text?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="ai-debug-block">
      <button className="ai-debug-toggle" onClick={() => setShow(!show)}>
        {show ? "▾" : "▸"} {label}
        <small>（{text?.length ?? 0} 字）</small>
      </button>
      {show && <pre className="text-preview">{text || "（空）"}</pre>}
    </div>
  );
}

function DebugEntry({ record }: { record: AiDebugRecord }) {
  return (
    <article className="ai-debug-entry">
      <header>
        <b>{record.at}</b>
        <span className="badge">{record.purpose}</span>
        {record.error && <span className="badge amber">失败</span>}
      </header>
      <div className="ai-debug-grid">
        <Row label="1. purpose" value={record.purpose} />
        <Row label="2. 当前 scenario" value={record.scenario} />
        <Row label="3. 模板 ID" value={record.templateId} />
        <Row label="4. 模板名称" value={record.templateName} />
        <Row label="5. 命中场景" value={record.matchedScenario} />
        <Row label="9. 使用 Few-shot" value={record.fewShotName} />
        <Row label="12. provider" value={record.provider} />
        <Row label="13. model" value={record.model} />
        <Row label="14. temperature" value={record.temperature} />
        <Row label="15. max_tokens" value={record.maxTokens} />
        <Row label="17. AI 返回字符数" value={record.rawResponseLength} />
        <Row label="19. UI 最终字符数" value={record.finalTextLength} />
        {/* 20 起为诊断补充项：上一次「返回内容为空」查不下去，就是因为缺了这几个字段。 */}
        <Row label="20. finish_reason" value={record.finishReason} />
        <Row
          label="21. 用量（入/出）"
          value={
            record.promptTokens === undefined && record.completionTokens === undefined
              ? undefined
              : `${record.promptTokens ?? "?"} / ${record.completionTokens ?? "?"}`
          }
        />
        <Row
          label="22. 是否只回了思考过程"
          value={
            record.hasReasoning === undefined
              ? undefined
              : record.hasReasoning
                ? "是"
                : "否"
          }
        />
      </div>
      {record.notice && <p className="notice">{record.notice}</p>}
      {record.error && <p className="error">错误：{record.error}</p>}
      <Block label="6. System Prompt" text={record.systemPrompt} />
      <Block label="7. Scenario Prompt" text={record.scenarioPrompt} />
      <Block
        label="8. Personal Style Prompt"
        text={record.personalStylePrompt}
      />
      <Block label="9. Few-shot" text={record.fewShotPrompt} />
      <Block label="10. 脱敏后 User Content" text={record.userContent} />
      <Block label="11. 最终完整 Prompt" text={record.fullPrompt} />
      <Block label="16. AI 原始 response" text={record.rawResponse} />
      <Block label="18. UI 最终展示文本" text={record.finalText} />
      <Block label="23. 失败时的原始响应体" text={record.rawBody} />
    </article>
  );
}
