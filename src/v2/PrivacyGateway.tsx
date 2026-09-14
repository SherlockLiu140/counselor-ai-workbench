import { useMemo, useState } from "react";
import { detect, minimumNecessary, render } from "../engine/engine";
import { changeReview, confirmReview, type Review } from "../engine/review";
import { copyText } from "./desktop";
import {
  defaultOptions,
  labels,
  type Context,
  type Finding,
  type Student,
} from "../engine/types";
import type { ConversationRecord, StudentRecord, V2Space } from "./types";
import {
  activeProvider as resolveActiveProvider,
  aiCallDetails,
  callChatCompletion,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  loadAiSettings,
} from "./providers";
import {
  buildTalkPromptLayers,
  extractScenarioTopic,
} from "./prompt";
import { recordAiDebug, startAiDebugRecord } from "./aiDebug";

export function asV1Student(student: StudentRecord, space: V2Space): Student {
  return {
    id: student.id,
    name: student.name,
    studentId: student.studentNo,
    className:
      space.classes.find((item) => item.id === student.classId)?.name ?? "",
    phone: student.phone,
    email: student.email,
    dorm: student.dorm,
    address: student.address,
  };
}

export function buildMinimumTalkSource(space: V2Space, student: StudentRecord) {
  const event =
    space.events.find(
      (item) => item.studentId === student.id && item.status !== "已结案",
    ) ?? space.events.find((item) => item.studentId === student.id);
  const conversation = [...space.conversations]
    .reverse()
    .find(
      (item) =>
        item.studentId === student.id && (!event || item.eventId === event.id),
    );
  const template = space.conversationTemplates.find(
    (item) => item.id === conversation?.templateId,
  );
  const academicTask = !!event && /学业|学习|成绩|挂科/.test(`${event.type} ${event.facts}`);
  const academic = space.academicRecords
    .filter((item) => item.studentId === student.id)
    .filter((item) => item.score !== undefined || item.rank !== undefined || item.failedCount !== undefined)
    .slice(-2);
  const academicSummary = academicTask && academic.length
    ? `学业变化：${academic.map((item) => `${item.term}平均成绩${item.score ?? "未记录"}、班级排名${item.rank ?? "未记录"}`).join(" → ")}；挂科${academic.at(-1)?.failedCount ?? academic.filter((item) => item.failed).length}门。`
    : undefined;
  return [
    "任务：整理班主任谈话记录",
    `学生：${student.name}`,
    `谈话主题：${conversation?.scenario ?? event?.type ?? "未指定"}`,
    event
      ? `已确认事实：${event.facts}`
      : "已确认事实：暂无关联事件，请勿补充推测。",
    academicSummary,
    conversation
      ? `谈话草稿：${conversation.finalRecord || conversation.rawNotes}`
      : "谈话草稿：尚未形成谈话记录。",
    template
      ? `成文习惯：${template.tone ?? "自然"}，${template.person ?? "第三人称"}，约 ${template.defaultLength ?? 300} 字；${template.writingStyle}${template.customPromptRules ? `；${template.customPromptRules}` : ""}`
      : undefined,
    // 与 buildConversationTalkSource 保持同一措辞：守住事实边界，但不暗示压缩成摘要。
    "事实边界：只使用上述已确认内容，不做心理诊断，不给学生贴标签，不添加输入中没有的事实；"
      + "但在这些事实允许的范围内请充分展开，整理成完整可用的谈话记录，不要压缩成摘要。",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 针对「某一条」谈话记录构建最小必要材料。
 * 与 buildMinimumTalkSource 的区别：那个只取该生最近一条，无法指定历史记录。
 */
export function buildConversationTalkSource(
  space: V2Space,
  conversation: ConversationRecord,
) {
  const student = space.students.find(
    (item) => item.id === conversation.studentId,
  );
  const event = space.events.find((item) => item.id === conversation.eventId);
  const template = space.conversationTemplates.find(
    (item) => item.id === conversation.templateId,
  );
  return [
    "任务：整理班主任谈话记录",
    `学生：${student?.name ?? "未知学生"}`,
    `谈话主题：${conversation.scenario}`,
    `谈话时间：${conversation.happenedAt}`,
    `谈话地点：${conversation.location || "未填写"}`,
    event
      ? `已确认事实：${event.facts}`
      : "已确认事实：无关联事件，请勿补充推测。",
    `口述原始记录：${conversation.rawNotes}`,
    conversation.studentExpression
      ? `学生主要表达：${conversation.studentExpression}`
      : undefined,
    conversation.counselorGuidance
      ? `班主任沟通与引导：${conversation.counselorGuidance}`
      : undefined,
    conversation.agreements
      ? `达成的共识 / 措施：${conversation.agreements}`
      : undefined,
    conversation.followUpPlan
      ? `后续跟进事项：${conversation.followUpPlan}`
      : undefined,
    template
      ? `成文习惯：${template.tone ?? "自然"}，${template.person ?? "第三人称"}，约 ${template.defaultLength ?? 300} 字；${template.writingStyle}${template.customPromptRules ? `；${template.customPromptRules}` : ""}`
      : undefined,
    // 注意措辞：既要守住事实边界，又不能暗示「压缩成摘要」。
    // 旧版写的是「只整理事实……」，正是模型倾向于输出短摘要的原因之一。
    "事实边界：只使用上述已确认内容，不做心理诊断，不给学生贴标签，不添加输入中没有的事实；"
      + "但在这些事实允许的范围内请充分展开，整理成完整可用的谈话记录，不要压缩成摘要。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAcademicTalkSource(space: V2Space, student: StudentRecord) {
  const academic = space.academicRecords
    .filter((item) => item.studentId === student.id)
    .filter((item) => item.score !== undefined || item.rank !== undefined || item.failedCount !== undefined)
    .slice(-6);
  const events = space.events
    .filter((item) => item.studentId === student.id && /学业|学习|成绩|挂科/.test(`${item.type} ${item.facts}`))
    .slice(0, 3);
  return [
    "任务：生成学业变化谈话提纲",
    `学生：${student.name}`,
    `学业记录：${academic.length ? academic.map((item) => `${item.term}平均成绩${item.score ?? "未记录"}、班级排名${item.rank ?? "未记录"}`).join(" → ") : "暂无成绩与排名记录"}`,
    `挂科情况：${academic.at(-1)?.failedCount ?? academic.filter((item) => item.failed).length}门`,
    events.length ? `必要的近期事件：${events.map((item) => `${item.occurredAt} ${item.facts}`).join("；")}` : "必要的近期事件：暂无",
    "输出要求：只围绕学业变化、待核实原因和下一步学习支持形成谈话提纲，不添加未提供的事实。",
  ].join("\n");
}

export function restoreLocalIdentity(text: string, space: V2Space) {
  let result = text;
  for (const student of space.students) {
    const code = space.privacyCodes[student.id];
    if (code) result = result.replaceAll(code, student.name);
  }
  return result;
}

function updateFinding(review: Review, id: string, patch: Partial<Finding>) {
  return changeReview(
    review,
    review.findings.map((finding) =>
      finding.id === id ? { ...finding, ...patch, reviewed: true } : finding,
    ),
  );
}

export function PrivacyGateway({
  space,
  student,
  title = "AI 帮我成文",
  purpose = "talk",
  sourceText,
  scenario,
  templateId,
  onCancel,
  onOpenSettings,
  onSave,
}: {
  space: V2Space;
  student?: StudentRecord;
  title?: string;
  purpose?: "talk" | "award" | "career" | "material";
  sourceText?: string;
  /** 谈话场景主题；缺省时从 source 文本里解析「谈话主题」行。 */
  scenario?: string;
  /** 谈话个人模板 ID；用于叠加个人风格 Prompt。 */
  templateId?: string;
  onCancel: () => void;
  onOpenSettings?: () => void;
  onSave: (result: string) => Promise<void>;
}) {
  const source = useMemo(
    () =>
      sourceText ??
      (student
        ? buildMinimumTalkSource(space, student)
        : "当前没有可发送的最小必要材料。"),
    [space, student, sourceText],
  );
  const task =
    purpose === "career" ? "career" : purpose === "talk" ? "talk" : "other";
  const context: Context = useMemo(
    () => ({
      text: source,
      students: space.students.map((item) => asV1Student(item, space)),
      codes: space.privacyCodes,
      options: { ...defaultOptions, task, class: false },
      customRules: [],
    }),
    [source, space, task],
  );
  const [review, setReview] = useState<Review>(() => ({
    source,
    findings: detect(context),
    revision: 0,
    confirmedRevision: null,
    riskAcknowledged: false,
    level: "L2",
  }));
  const [payloadDraft, setPayloadDraft] = useState<string | null>(null);
  const [payload, setPayload] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [auditAccepted, setAuditAccepted] = useState(false);
  const [error, setError] = useState("");
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState("");
  /** 自动重试等过程性提示：重试会真实产生一次外部请求，界面必须如实说明。 */
  const [callNotice, setCallNotice] = useState("");
  const restored = restoreLocalIdentity(aiResult, space);
  const currentPayload = payloadDraft ?? render(review.source, review.findings);
  function revise(id: string, patch: Partial<Finding>) {
    setReview(updateFinding(review, id, patch));
    setPayloadDraft(null);
  }
  function approve() {
    try {
      const confirmed = confirmReview(review, context);
      const remainingDirect = detect({
        ...context,
        text: currentPayload,
      }).filter((finding) =>
        ["name", "studentId", "phone", "identity", "email", "contact"].includes(
          finding.type,
        ),
      );
      if (remainingDirect.length)
        throw new Error(
          "AI payload 中仍有直接标识信息，请删除或替换后再确认。 ",
        );
      setReview(confirmed);
      setPayload(currentPayload);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  const outputInstruction =
    purpose === "award"
      ? "按推荐意见或事迹材料的用途整理，突出可核实事实、办理状态和材料依据。"
      : purpose === "career"
        ? "按升学就业任务整理目标、当前进展、待核实事项和下一步行动。"
        : purpose === "material"
          ? "保留原材料用途和事实顺序，优化为可直接审核、复制和归档的正式文本。"
          : "按“谈话背景、学生情况与反馈、班主任沟通与引导、当前结果或后续关注、后续跟进安排”输出。";
  // 谈话成文走分层结构：System → Scenario → Personal Style → Few-shot → User Content → Final Instruction。
  // 其余用途（评奖评优 / 升学就业 / 材料）保持原有简短指令，不属于谈话成文链路。
  const talkLayers = useMemo(() => {
    if (purpose !== "talk") return undefined;
    const template = templateId
      ? space.conversationTemplates.find((item) => item.id === templateId)
      : space.conversationTemplates.find((item) => item.isDefault);
    const topic = scenario ?? extractScenarioTopic(source);
    return {
      ...buildTalkPromptLayers({ scenarioTopic: topic, template }),
      topic,
      templateId: template?.id,
      templateName: template?.name,
    };
  }, [purpose, templateId, scenario, source, space]);
  const prompt = useMemo(() => {
    if (purpose !== "talk" || !talkLayers)
      return [
        `你是班主任${purpose === "award" ? "评奖评优材料" : purpose === "career" ? "升学就业" : "材料"}整理助手。`,
        "只使用下方已去标识化且经过人工确认的内容。",
        "不得补充事实，不做心理诊断，不给学生贴标签。",
        outputInstruction,
        "",
        payload,
      ].join("\n");
    // 正确顺序：System → Scenario → Personal Style → Few-shot → User Content → Final Instruction
    return [
      talkLayers.system,
      "",
      talkLayers.scenario,
      ...(talkLayers.personalStyle ? ["", talkLayers.personalStyle] : []),
      ...(talkLayers.fewShot ? ["", talkLayers.fewShot] : []),
      "",
      "以下是经过去标识化且人工确认的内容，只依据它整理：",
      "",
      payload,
      "",
      talkLayers.finalInstruction,
    ].join("\n");
  }, [purpose, talkLayers, outputInstruction, payload]);
  const ai = useMemo(() => resolveActiveProvider(loadAiSettings()), []);
  async function runAi() {
    if (!ai) return;
    setCalling(true);
    setCallError("");
    setCallNotice("");
    // 调试留痕：只记录 prompt / 参数 / 返回，绝不记录 API Key。
    const debug = talkLayers
      ? startAiDebugRecord({
          purpose,
          scenario: talkLayers.topic,
          templateId: talkLayers.templateId,
          templateName: talkLayers.templateName,
          matchedScenario: talkLayers.scenarioName,
          systemPrompt: talkLayers.system,
          scenarioPrompt: talkLayers.scenario,
          personalStylePrompt: talkLayers.personalStyle,
          fewShotPrompt: talkLayers.fewShot,
          fewShotName: talkLayers.fewShotName,
          finalInstruction: talkLayers.finalInstruction,
          userContent: payload,
          fullPrompt: prompt,
        })
      : undefined;
    try {
      const text = await callChatCompletion(ai.preset, ai.config, prompt, undefined, {
        onNotice: setCallNotice,
      });
      setAiResult(text);
      setAuditAccepted(false);
      if (debug)
        recordAiDebug({
          ...debug,
          provider: ai.preset.name,
          model: ai.config.model,
          temperature: DEFAULT_TEMPERATURE,
          maxTokens: DEFAULT_MAX_TOKENS,
          rawResponse: text,
          rawResponseLength: text.length,
          finalText: restoreLocalIdentity(text, space),
          finalTextLength: restoreLocalIdentity(text, space).length,
        });
    } catch (cause) {
      const message = (cause as Error).message;
      const details = aiCallDetails(cause);
      setCallError(message);
      if (debug)
        recordAiDebug({
          ...debug,
          provider: ai.preset.name,
          model: ai.config.model,
          temperature: DEFAULT_TEMPERATURE,
          maxTokens: DEFAULT_MAX_TOKENS,
          error: message,
          finishReason: details?.finishReason,
          promptTokens: details?.promptTokens,
          completionTokens: details?.completionTokens,
          hasReasoning: details?.hasReasoning,
          rawBody: details?.rawBody,
        });
    } finally {
      setCalling(false);
    }
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal privacy-gateway"
        role="dialog"
        aria-modal="true"
        aria-label="AI Privacy Gateway"
      >
        <div className="section-title">
          <div>
            <span className="eyebrow">AI PRIVACY GATEWAY</span>
            <h2>{title} · 发送前人工确认</h2>
          </div>
          <button aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="gateway-steps">
          <span className="active">1 最小必要</span>
          <span className={payload ? "active" : ""}>2 去标识化</span>
          <span className={aiResult ? "active" : ""}>3 本地恢复</span>
          <span className={auditAccepted ? "active" : ""}>4 人工审核</span>
        </div>
        <p className="notice">
          {minimumNecessary(task)}{" "}
          宗教、性取向、身份证、联系方式和完整敏感档案未进入本次材料。
        </p>
        <div className="comparison">
          <article className="panel">
            <h3>
              本地原文 <small>AI 看不到此栏</small>
            </h3>
            <pre className="text-preview">{source}</pre>
          </article>
          <article className="panel">
            <h3>AI 实际看到的内容</h3>
            {payload ? (
              <pre className="text-preview">{payload}</pre>
            ) : (
              <textarea
                aria-label="手工编辑 AI payload"
                className="text-preview gateway-payload-editor"
                value={currentPayload}
                onChange={(event) => setPayloadDraft(event.target.value)}
              />
            )}
          </article>
        </div>
        <div className="finding-list">
          {review.findings.map((finding) => (
            <article className="finding gateway-finding" key={finding.id}>
              <div>
                <span
                  className={`badge ${finding.risk === "high" ? "amber" : ""}`}
                >
                  {labels[finding.type]} ·{" "}
                  {finding.risk === "high" ? "高" : "中"}风险
                </span>
                <b>{finding.original}</b>
                <small>{finding.reason}</small>
              </div>
              <div>
                <label>
                  替换为
                  <input
                    value={finding.replacement}
                    onChange={(event) =>
                      revise(finding.id, {
                        replacement: event.target.value,
                        action: "replace",
                      })
                    }
                  />
                </label>
                <div className="button-row">
                  <button
                    onClick={() =>
                      revise(finding.id, {
                        action: "replace",
                      })
                    }
                  >
                    采用替换
                  </button>
                  <button
                    onClick={() => revise(finding.id, { action: "delete" })}
                  >
                    删除
                  </button>
                  <button
                    onClick={() =>
                      revise(finding.id, {
                        action: "restore",
                      })
                    }
                  >
                    恢复原文
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!payload && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={review.riskAcknowledged}
                onChange={(event) =>
                  setReview({
                    ...review,
                    riskAcknowledged: event.target.checked,
                    confirmedRevision: null,
                  })
                }
              />
              我已核对 AI 实际看到的内容，并判断其符合当前任务的最小必要范围。
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button onClick={onCancel}>取消</button>
              <button className="primary" onClick={approve}>
                确认 AI payload
              </button>
            </div>
          </>
        )}
        {payload && (
          <section className="gateway-return">
            <h3>交由 AI 成文</h3>
            <p>
              AI 由教师主动触发，工作台不会自动联网。可复制 Prompt 到任意外部 AI，也可直接调用已配置的服务商；
              两种方式发送的都只是上方「AI 实际看到的内容」，本地原文不进入 AI 输入。
            </p>
            <div className="button-row">
              <button onClick={() => void copyText(prompt)}>
                复制已确认 Prompt
              </button>
              {ai ? (
                <button
                  className="primary"
                  disabled={calling}
                  onClick={() => void runAi()}
                >
                  {calling ? "正在调用…" : `直接调用 ${ai.preset.name}`}
                </button>
              ) : (
                <button onClick={onOpenSettings}>配置 AI 服务商 →</button>
              )}
            </div>
            {ai && (
              <p className="gateway-ai-note">
                当前使用 {ai.preset.name} · {ai.config.model}
                ；API Key 仅保存在本机，且不随本地备份导出。
              </p>
            )}
            {callNotice && (
              <p className="notice" role="status">
                {callNotice}
              </p>
            )}
            {callError && (
              <p className="error" role="alert">
                {callError}
              </p>
            )}
            <label>
              AI 返回内容
              <textarea
                aria-label="粘贴 AI 返回"
                value={aiResult}
                onChange={(event) => {
                  setAiResult(event.target.value);
                  setAuditAccepted(false);
                }}
                placeholder="从外部 AI 手工粘贴返回内容；真实姓名将在本机恢复。"
              />
            </label>
            {aiResult && (
              <>
                <label>
                  本地恢复后的结果
                  <textarea
                    aria-label="本地恢复结果"
                    value={restored}
                    readOnly
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={auditAccepted}
                    onChange={(event) => setAuditAccepted(event.target.checked)}
                  />
                  我已人工审核恢复后的文字，确认没有新增事实、诊断或标签化表述。
                </label>
                <div className="modal-actions">
                  <button onClick={onCancel}>取消</button>
                  <button
                    className="primary"
                    disabled={!auditAccepted}
                    onClick={() => void onSave(restored)}
                  >
                    保存审核结果
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </section>
    </div>
  );
}
