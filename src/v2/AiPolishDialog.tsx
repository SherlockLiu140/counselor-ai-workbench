import { useMemo, useState } from "react";
import { detect, minimumNecessary, render } from "../engine/engine";
import { changeReview, type Review } from "../engine/review";
import { copyText } from "./desktop";
import {
  defaultOptions,
  labels,
  type Context,
  type Finding,
} from "../engine/types";
import type { V2Space } from "./types";
import { asV1Student, restoreLocalIdentity } from "./PrivacyGateway";
import { buildTalkPromptLayers, extractScenarioTopic } from "./prompt";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  PROVIDERS,
  activeProvider as resolveActiveProvider,
  aiCallDetails,
  callChatCompletion,
  isProviderReady,
  loadAiSettings,
  providerConfig,
  saveAiSettings,
  type ProviderId,
} from "./providers";
import { recordAiDebug, startAiDebugRecord } from "./aiDebug";

/**
 * 「AI 润色」弹窗 —— 打开一份口述谈话记录后的唯一入口。
 *
 * 为什么单独做成弹窗而不是又一个流程页：
 * 老师的心智是「这条记录写得太口语，帮我顺一遍」，而不是「我要启动一条生成流水线」。
 * 所以这里只做一件事：选一家的 AI → 看一眼 AI 实际会收到什么 → 一键润色 → 结果贴回。
 *
 * 边界（务必保持）：
 * - 去标识化仍走 Privacy Gateway 的 detect / render，**不改脱敏算法**；
 * - 「AI 实际会看到的内容」始终可见，人工点「一键润色」即代表最终确认；
 * - 返回文本一律经 restoreLocalIdentity 在本机恢复真实姓名，恢复过程不经过外部 AI；
 * - API Key 只从本机 AI 设置读取，绝不出现在界面、日志或调试记录中。
 */

/** 润色后的轻量微调：复用同一份已确认 payload，不重新发送真实身份。 */
const ADJUSTMENTS: Array<{ label: string; instruction: string }> = [
  { label: "再自然一点", instruction: "语气再自然一些，避免生硬公文腔，但仍保持校内工作记录的正式可用性。" },
  { label: "再正式一点", instruction: "语气再正式、规范一些，适合直接提交到学工系统。" },
  { label: "更详细", instruction: "在不新增任何事实的前提下，把已经提供的信息展开得更充分一些。" },
  { label: "更简洁", instruction: "在不丢失已有信息的前提下，把表达精简一些，不要写成短摘要。" },
];

export function AiPolishDialog({
  space,
  title = "AI 润色谈话记录",
  subtitle,
  sourceText,
  scenario,
  templateId,
  onApply,
  onClose,
  onOpenSettings,
}: {
  space: V2Space;
  title?: string;
  subtitle?: string;
  /** 本地待润色原文（最小必要材料，尚未去标识化）。 */
  sourceText: string;
  /** 谈话场景主题，用于命中对应 Scenario Prompt。 */
  scenario?: string;
  /** 默认使用的个人谈话模板。 */
  templateId?: string;
  /** 贴回：把人工确认后的润色结果交回调用方保存。 */
  onApply: (polished: string) => Promise<void>;
  onClose: () => void;
  onOpenSettings?: () => void;
}) {
  /* ---------------- AI 服务商 / 模型 ---------------- */

  const [settings, setSettings] = useState(() => loadAiSettings());
  const readyProviders = useMemo(
    () => PROVIDERS.filter((preset) => isProviderReady(settings, preset.id)),
    [settings],
  );
  const fallback = useMemo(() => resolveActiveProvider(settings), [settings]);
  const [providerId, setProviderId] = useState<ProviderId | "">(
    fallback?.preset.id ?? "",
  );
  const preset = PROVIDERS.find((item) => item.id === providerId);
  const savedConfig = preset ? providerConfig(settings, preset.id) : undefined;
  const [modelOverride, setModelOverride] = useState<string>();
  const model = modelOverride ?? savedConfig?.model ?? "";
  const modelOptions = useMemo(() => {
    if (!preset) return [];
    const ids = preset.models.map((item) => item.id);
    return model && !ids.includes(model) ? [model, ...ids] : ids;
  }, [preset, model]);

  function chooseProvider(id: ProviderId) {
    setProviderId(id);
    setModelOverride(undefined);
    const next = { ...settings, activeProvider: id };
    setSettings(next);
    saveAiSettings(next);
  }
  function chooseModel(next: string) {
    setModelOverride(next);
    if (!preset) return;
    const merged = {
      ...settings,
      providers: {
        ...settings.providers,
        [preset.id]: { ...providerConfig(settings, preset.id), model: next },
      },
    };
    setSettings(merged);
    saveAiSettings(merged);
  }

  /* ---------------- 个人谈话模板 ---------------- */

  const templates = space.conversationTemplates;
  const [pickedTemplateId, setPickedTemplateId] = useState(
    templateId ??
      templates.find((item) => item.isDefault)?.id ??
      templates[0]?.id ??
      "",
  );
  const template = templates.find((item) => item.id === pickedTemplateId);

  /* ---------------- 去标识化（复用 Gateway 算法，不改） ---------------- */

  const context: Context = useMemo(
    () => ({
      text: sourceText,
      students: space.students.map((item) => asV1Student(item, space)),
      codes: space.privacyCodes,
      options: { ...defaultOptions, task: "talk" as const, class: false },
      customRules: [],
    }),
    [sourceText, space],
  );
  const [review, setReview] = useState<Review>(() => ({
    source: sourceText,
    findings: detect(context),
    revision: 0,
    confirmedRevision: null,
    riskAcknowledged: false,
    level: "L2",
  }));
  const payload = useMemo(
    () => render(review.source, review.findings),
    [review],
  );
  function revise(id: string, patch: Partial<Finding>) {
    setReview(
      changeReview(
        review,
        review.findings.map((finding) =>
          finding.id === id ? { ...finding, ...patch, reviewed: true } : finding,
        ),
      ),
    );
  }
  const changed = review.findings.filter((item) => item.action !== "restore");
  const removed = changed.filter((item) => item.action === "delete").length;
  const replaced = changed.length - removed;

  /* ---------------- 一键润色 ---------------- */

  const [phase, setPhase] = useState<"config" | "calling" | "result">("config");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  /** 自动重试等过程性提示：重试会真实产生一次外部请求，必须在界面上说明。 */
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyIssue, setCopyIssue] = useState("");
  const [applying, setApplying] = useState(false);
  /** 隐私对照默认折叠；润色成功后自动收起，让结果区更突出。 */
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const canPolish = !!preset && !!model.trim();
  /** 保存的模型 ID 可能来自旧版本预设或手工填写，不在预设列表时先提醒一句。 */
  const modelUnknown =
    !!preset && !!model.trim() && !preset.models.some((item) => item.id === model);

  async function polish(adjust?: string) {
    if (!preset || !savedConfig || !canPolish) return;
    const topic = scenario ?? extractScenarioTopic(sourceText);
    const layers = buildTalkPromptLayers({ scenarioTopic: topic, template });
    const prompt = [
      layers.system,
      "",
      layers.scenario,
      ...(layers.personalStyle ? ["", layers.personalStyle] : []),
      ...(layers.fewShot ? ["", layers.fewShot] : []),
      "",
      "以下是经过去标识化且人工确认的内容，只依据它整理：",
      "",
      payload,
      "",
      layers.finalInstruction,
      ...(adjust ? ["", `进一步调整要求：${adjust}`] : []),
    ].join("\n");
    setPhase("calling");
    setError("");
    setNotice("");
    // 调试留痕：只记录 prompt / 参数 / 返回，绝不记录 API Key。
    const debug = startAiDebugRecord({
      purpose: "talk",
      scenario: topic,
      templateId: template?.id,
      templateName: template?.name,
      matchedScenario: layers.scenarioName,
      systemPrompt: layers.system,
      scenarioPrompt: layers.scenario,
      personalStylePrompt: layers.personalStyle,
      fewShotPrompt: layers.fewShot,
      fewShotName: layers.fewShotName,
      finalInstruction: layers.finalInstruction,
      userContent: payload,
      fullPrompt: prompt,
    });
    try {
      const text = await callChatCompletion(
        preset,
        { ...savedConfig, model },
        prompt,
        undefined,
        { onNotice: setNotice },
      );
      const restored = restoreLocalIdentity(text, space);
      setResult(restored);
      setCopied(false);
      setPrivacyOpen(false);
      setPhase("result");
      recordAiDebug({
        ...debug,
        provider: preset.name,
        model,
        temperature: DEFAULT_TEMPERATURE,
        maxTokens: DEFAULT_MAX_TOKENS,
        rawResponse: text,
        rawResponseLength: text.length,
        finalText: restored,
        finalTextLength: restored.length,
      });
    } catch (cause) {
      const message = (cause as Error).message;
      const details = aiCallDetails(cause);
      setError(message);
      setPhase("config");
      recordAiDebug({
        ...debug,
        provider: preset.name,
        model,
        temperature: DEFAULT_TEMPERATURE,
        maxTokens: DEFAULT_MAX_TOKENS,
        error: message,
        finishReason: details?.finishReason,
        promptTokens: details?.promptTokens,
        completionTokens: details?.completionTokens,
        hasReasoning: details?.hasReasoning,
        rawBody: details?.rawBody,
      });
    }
  }

  async function apply() {
    setApplying(true);
    setError("");
    try {
      await onApply(result.trim());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal polish-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-title">
          <div>
            <span className="eyebrow">AI 润色</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="polish-config">
          <label>
            交给 AI
            <select
              aria-label="选择 AI 服务商"
              value={providerId}
              onChange={(event) =>
                chooseProvider(event.target.value as ProviderId)
              }
            >
              {readyProviders.length ? (
                readyProviders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              ) : (
                <option value="">未配置服务商</option>
              )}
            </select>
          </label>
          <label>
            模型
            <select
              aria-label="选择模型"
              value={model}
              disabled={!preset || !modelOptions.length}
              onChange={(event) => chooseModel(event.target.value)}
            >
              {modelOptions.map((id) => (
                <option key={id} value={id}>
                  {preset?.models.find((item) => item.id === id)?.label ?? id}
                </option>
              ))}
            </select>
          </label>
          <label>
            写作模板
            <select
              aria-label="选择谈话模板"
              value={pickedTemplateId}
              onChange={(event) => setPickedTemplateId(event.target.value)}
            >
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {modelUnknown && (
          <p className="notice">
            所选模型「{model}」不在预设列表中，可能是已停用的旧型号或填写有误。
            若润色失败，请到「AI 设置」点「拉取模型列表」核对模型 ID。
          </p>
        )}

        {!readyProviders.length && (
          <p className="notice">
            还没有可用的 AI 服务商。请先填一个 API Key（含免费的 Agens）。
          </p>
        )}

        <details
          className="polish-privacy"
          open={privacyOpen}
          onToggle={(event) =>
            setPrivacyOpen((event.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary>
            AI 实际会看到的内容
            <small>
              {replaced ? `已替换 ${replaced} 处` : ""}
              {replaced && removed ? " · " : ""}
              {removed ? `已删除 ${removed} 处` : ""}
              {!changed.length ? "未发现需处理的信息" : ""}
            </small>
          </summary>
          <p className="notice">{minimumNecessary("talk")}</p>
          <div className="comparison">
            <article className="panel">
              <h3>
                本地原文 <small>AI 看不到此栏</small>
              </h3>
              <pre className="text-preview">{review.source}</pre>
            </article>
            <article className="panel">
              <h3>AI 实际看到的内容</h3>
              <pre className="text-preview">{payload}</pre>
            </article>
          </div>
          {changed.length ? (
            <div className="finding-list">
              {review.findings.map((finding) => (
                <article className="finding gateway-finding" key={finding.id}>
                  <div>
                    <span
                      className={`badge ${finding.risk === "high" ? "amber" : ""}`}
                    >
                      {labels[finding.type]}
                    </span>
                    <b>{finding.original}</b>
                    <small>{finding.reason}</small>
                  </div>
                  <div className="button-row">
                    <button
                      onClick={() =>
                        revise(finding.id, { action: "replace" })
                      }
                    >
                      替换为 {finding.replacement}
                    </button>
                    <button onClick={() => revise(finding.id, { action: "delete" })}>
                      删除
                    </button>
                    <button
                      onClick={() => revise(finding.id, { action: "restore" })}
                    >
                      恢复原文
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </details>

        {phase === "result" ? (
          <label className="polish-result">
            润色结果（可直接编辑）
            <textarea
              aria-label="润色结果"
              className="text-preview polish-text"
              value={result}
              onChange={(event) => {
                setResult(event.target.value);
                setCopied(false);
              }}
            />
            <small className="polish-hint">
              学生姓名已在本机恢复，恢复过程不经过外部 AI。
            </small>
          </label>
        ) : null}

        {phase === "result" ? (
          <div className="button-row polish-adjust">
            <span>调整：</span>
            {ADJUSTMENTS.map((item) => (
              <button
                key={item.label}
                disabled={phase !== "result"}
                onClick={() => void polish(item.instruction)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          {phase !== "result" ? (
            <>
              <button onClick={onClose}>取消</button>
              {readyProviders.length ? (
                <button
                  className="primary"
                  disabled={phase === "calling" || !canPolish}
                  onClick={() => void polish()}
                >
                  {phase === "calling" ? "正在润色…" : "一键润色"}
                </button>
              ) : (
                <button className="primary" onClick={onOpenSettings}>
                  去配置 AI 服务商 →
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => void polish()} disabled={!canPolish}>
                重新润色
              </button>
              <button
                onClick={async () => {
                  const ok = await copyText(result);
                  setCopied(ok);
                  setCopyIssue(
                    ok ? "" : "复制失败，请手动选中文本复制。",
                  );
                }}
              >
                {copied ? "已复制" : "复制结果"}
              </button>
              {copyIssue && (
                <p className="ai-feedback bad" role="alert">
                  {copyIssue}
                </p>
              )}
              <button
                className="primary"
                disabled={applying || !result.trim()}
                onClick={() => void apply()}
              >
                {applying ? "正在保存…" : "贴回谈话记录"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
