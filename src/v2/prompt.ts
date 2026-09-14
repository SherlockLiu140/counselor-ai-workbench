import type { ConversationTemplate } from "./types";
import { buildFewShotPrompt, fewShotFor } from "./talkFewShots";

/**
 * AI 谈话成文 Prompt 的四层结构：
 *
 *  1. System Prompt      —— 事实边界 / 安全 / 写作原则 / 禁止套话 / 输出结构
 *  2. Scenario Prompt    —— 不同谈话场景的关注重点、应突出与应避免的内容
 *  3. Personal Style     —— 班主任个人模板决定「怎么写」（语气 / 人称 / 长度 / 侧重）
 *  4. User Content       —— 仅放经过 Privacy Gateway 去标识化且人工确认的事实
 *
 * 本模块只负责把前两层（System / Scenario）与个人风格层组装成指令，
 * 事实层（User Content）由 PrivacyGateway 在脱敏并人工确认后拼入，
 * 因此这里不接触任何学生原始数据。
 */

/* ------------------------------------------------------------------ */
/* 1. System Prompt：事实边界、安全、写作与禁止事项                      */
/* ------------------------------------------------------------------ */

export function buildSystemPrompt(): string {
  return [
    "你正在帮助高职院校班主任整理谈心谈话记录。",
    "你的任务不是创作，而是在不增加新事实的前提下，把班主任提供的零散记录整理成可直接用于校内学生工作记录的正式文本。",
    "",
    "你必须遵守：",
    "- 只能依据输入内容整理，不得编造事实；",
    "- 不得虚构学生原话；",
    "- 不得虚构时间、地点、人物细节；",
    "- 不得做心理诊断、医学判断或风险分级；",
    "- 不得给学生贴标签；",
    "- 不得夸大问题的严重程度；",
    "- 不得使用空泛的套话和夸张表述；",
    "- 不得为了增加字数而重复同一信息；",
    "- 可以合理组织表达，但不能补充不存在的事实。",
    "",
    "请优先把内容整理为：",
    "1. 谈话背景（为什么进行本次谈话，贴近实际事项，避免机械空话）",
    "2. 学生情况与反馈（只整理输入中已有的经过、状态、困难与顾虑；没有明确反馈时写“围绕其近期情况进行了了解”，不要编学生原话）",
    "3. 班主任沟通与引导（把已做的沟通整理完整：梳理问题、提醒作息与节奏、建议寻求支持、针对学业/考勤/升学等提出建议；不得写成专业心理干预或医学建议）",
    "4. 当前结果或后续关注（有共识才写共识，没有则写“后续将继续关注其状态变化”，不写“达成一致”“深刻认识”）",
    "5. 后续跟进安排（接下来关注什么、是否复查、是否再次谈话；没有日期时用“后续将继续关注……并视情况再次沟通”，不要编具体时间）",
    "",
    "输出应：",
    "- 正式、自然、客观，不过度公文化；",
    "- 有班主任工作痕迹，但不虚构工作；",
    "- 适合班主任工作记录，可直接用于学工系统；",
    "- 与场景相匹配，与班主任个人模板风格相兼容。",
    "",
    "除非输入中确有对应事实，否则避免以下表达：",
    "- “通过此次谈话，学生深刻认识到了……”",
    "- “学生表示今后一定……”",
    "- “此次谈话取得了良好效果。”",
    "- “进一步增强了学生的……意识。”",
    "- “为其今后的成长成才奠定良好基础。”",
    "- “班主任对其进行了耐心细致的思想教育。”",
    "- “情绪基本稳定，无明显异常。”",
    "- “心理状态良好 / 不佳”等诊断式判断。",
    "",
    "尽量避免大量使用：进一步、切实、充分、全面、深入、有效提升、奠定良好基础。",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 2. Scenario Prompt：14 个谈话场景的专用指令                          */
/* ------------------------------------------------------------------ */

export interface ScenarioSpec {
  /** 场景名，与谈话主题 / 事件类型一致。 */
  name: string;
  /**
   * 强特征词：一旦出现，基本可以判定就是该场景（权重 3）。
   *
   * 之所以要区分强弱：一段口述里常常同时出现多个场景的弱特征。
   * 例如「分手了，吃不下饭，成绩也下降了」同时含「分手」与「成绩」「下降」，
   * 若只按命中数计分会误判成「挂科/成绩下降」——
   * 但语义上分手是原因、成绩下降是结果。
   */
  strong?: string[];
  /** 用于从谈话主题中模糊匹配的关键词（权重 1）。 */
  keywords: string[];
  /** 该场景的成文关注重点与应突出内容。 */
  focus: string[];
  /** 该场景应避免的内容。 */
  avoid: string[];
}

export const SCENARIOS: ScenarioSpec[] = [
  {
    name: "新生首次谈话",
    strong: ["新生", "入学", "迎新", "大一", "刚入学"],
    keywords: ["新生", "入学", "首次", "适应", "迎新"],
    focus: [
      "入学适应、对学校与专业的认识、宿舍与同学相处、学习习惯、家庭支持、大学阶段目标",
      "重点写“了解与适应”，语气偏温和、建立联系，不要写成问题处理报告",
      "原始信息简单时，突出“初步了解其适应情况与后续关注方向”",
    ],
    avoid: ["过度上纲上线", "无根据写学生已完全适应"],
  },
  {
    name: "日常关心",
    strong: ["日常关心", "近况", "聊聊", "了解一下近况"],
    keywords: ["日常", "关心", "近况", "生活", "闲聊", "聊聊", "了解一下"],
    focus: [
      "最近整体状态、学习生活作息、人际与情绪、是否存在现实困难、班主任的日常关心与后续关注",
      "语气自然，体现“常规了解、日常关心、持续关注”，不要写成严重问题干预",
    ],
    avoid: ["无依据写“问题突出”", "空泛流水账"],
  },
  {
    name: "缺勤/迟到",
    strong: ["缺勤", "迟到", "旷课", "未到", "没来上课"],
    keywords: ["缺勤", "迟到", "考勤", "旷课", "请假", "到课", "出勤"],
    focus: [
      "核实缺勤/迟到事实、了解原因、作息情况、学习投入与课程态度、是否有现实困难",
      "体现“核实 + 提醒 + 跟进”，强调考勤要求，后续落到“继续关注考勤变化、复查后续到课情况”",
    ],
    avoid: ["直接道德化批评", "写成处分决定", "无依据写“屡教不改”"],
  },
  {
    name: "挂科/成绩下降",
    strong: ["挂科", "补考", "重修", "不及格", "挂了"],
    keywords: ["挂科", "成绩", "补考", "重修", "学业", "学习", "下降", "不及格"],
    focus: [
      "哪些课程或整体成绩变化、学习困难、学习方法、时间投入、作息",
      "兼职/家庭/情绪等对学习的影响（仅在输入涉及时）、补考/重修/学习计划、后续成绩跟进",
      "核心是“学业问题 + 调整方向 + 后续计划”，后续落到“继续关注学习效果或补考准备”",
    ],
    avoid: ["只写成绩下降不写后续", "没根据就写具体学习计划细节"],
  },
  {
    name: "情感问题",
    strong: ["分手", "失恋", "恋爱", "感情纠纷", "被甩"],
    keywords: ["情感", "分手", "恋爱", "失恋", "感情", "情绪"],
    focus: [
      "当前情感事件、对学习生活饮食睡眠的影响（仅基于输入）、学生当前感受、支持系统",
      "班主任给予的安慰、提醒和支持；语气克制、有人情味，适合整理成支持性谈话记录",
      "可写“建议其适当调整生活节奏、主动沟通、必要时继续寻求支持”",
    ],
    avoid: ["心理诊断", "情绪风险判断", "写成说教", "写“已经完全走出阴影”等结论"],
  },
  {
    name: "家庭困难",
    strong: ["家庭困难", "经济困难", "住院", "低保", "贫困", "生活费紧张"],
    keywords: ["家庭困难", "经济", "困难", "生活费", "助学金", "资助", "贫困", "住院"],
    focus: [
      "实际困难情况、对学习生活的影响、已有支持、是否涉及资助/材料/帮扶、班主任的说明与后续安排",
      "强调“了解实际困难 + 提供支持路径 + 后续跟进”，可适当体现资助政策与材料准备（前提是输入涉及）",
    ],
    avoid: ["夸大困难程度", "无依据补充家庭成员细节", "写成“已妥善解决”除非输入明确说明"],
  },
  {
    name: "宿舍/人际矛盾",
    strong: ["室友", "宿舍矛盾", "人际矛盾", "宿舍关系", "同宿舍"],
    keywords: ["宿舍", "人际", "矛盾", "室友", "冲突", "相处", "争执"],
    focus: [
      "事情经过、学生感受、相处中的问题点、已有沟通情况、班主任的调解/引导方向、后续观察或复查",
      "体现“了解双方情况 / 引导理性沟通 / 后续持续观察”，语气客观中性、不偏袒",
    ],
    avoid: ["替任何一方下定论", "写成处分结论", "无依据写“矛盾已彻底解决”"],
  },
  {
    name: "心理状态关注",
    strong: ["心理", "焦虑", "抑郁", "失眠", "睡不着", "心理中心"],
    keywords: ["心理", "压力", "焦虑", "抑郁", "失眠", "情绪低落", "状态不佳", "睡不好"],
    focus: [
      "最近状态变化、睡眠饮食学习情绪表现（仅按输入）、学生主观感受、是否已有支持",
      "班主任的支持性沟通；必要时以非常克制的方式表达“如后续持续困扰，可进一步寻求校内相关支持”",
    ],
    avoid: [
      "诊断",
      "风险评级",
      "医学化语言",
      "“心理问题严重”“存在某某症状”等推断",
    ],
  },
  {
    name: "违纪",
    strong: ["违纪", "处分", "作弊", "打架", "违反纪律"],
    keywords: ["违纪", "违规", "处分", "打架", "抽烟", "作弊", "校纪", "纪律"],
    focus: [
      "违纪事实、学生说明、对校纪校规的认识、班主任提醒与教育、后续改进要求、后续观察",
      "语气客观、严肃但不夸张，体现“明确规则、提醒影响、督促改进”",
    ],
    avoid: ["空洞训话", "无依据写“深刻反省”", "写成正式处分文书口吻"],
  },
  {
    name: "奖助学金",
    strong: ["助学金", "奖学金", "困难认定", "资助"],
    keywords: ["奖助", "奖学金", "助学金", "困难认定", "材料", "申请", "评选", "资助"],
    focus: [
      "申请/评选相关情况、是否符合条件、当前材料进度、存在的缺失或问题、班主任提醒补充材料或核实事项、后续办理安排",
      "写清楚“项目 + 进度 + 材料 + 后续”，可偏事务型、过程型记录",
    ],
    avoid: ["无依据评价学生“品学兼优”", "无依据承诺“肯定能通过”"],
  },
  {
    name: "实习异常",
    strong: ["实习", "带教", "离岗", "换单位"],
    keywords: ["实习", "岗位", "带教", "单位", "换单位", "离职"],
    focus: [
      "当前实习单位/岗位情况（仅在输入涉及时）、出勤/适应/工作内容/人际/安全问题、学生当前困难、班主任提醒与支持、后续跟进",
      "突出“了解实习状态 + 协调/引导 + 后续跟进”，语言务实",
    ],
    avoid: ["无依据评价单位好坏", "代替学校或单位作决定", "无依据写“已完全解决”"],
  },
  {
    name: "就业迷茫",
    strong: ["求职", "投递", "简历", "offer", "找工作"],
    keywords: ["就业", "求职", "简历", "投递", "面试", "工作", "方向不明", "职业", "offer"],
    focus: [
      "对就业方向不明确、当前求职准备情况、简历/投递/面试/顾虑（仅按输入）、班主任帮助梳理方向、建议先完成的小步骤、后续跟进",
      "重点是“梳理方向 + 明确下一步”，可写得稍微具体，但不能编造投递或面试事实",
    ],
    avoid: ["空泛鸡汤", "无依据写出完整求职计划", "强行乐观化"],
  },
  {
    name: "专升本",
    strong: ["专升本"],
    keywords: ["专升本", "升学", "复习", "目标院校", "考试", "英语", "备考", "计划"],
    focus: [
      "当前目标院校/专业（如输入有）、复习进度、薄弱环节、时间安排、当前困难、班主任提醒与建议、后续复盘与跟进",
      "突出“目标—准备—困难—下一步”，后续落到复习计划或阶段复盘",
    ],
    avoid: ["编造考试时间、分数、详细计划", "空泛写“继续加油”"],
  },
  {
    name: "毕业前谈话",
    strong: ["毕业", "离校", "结业"],
    keywords: ["毕业", "离校", "去向", "手续", "档案", "结业"],
    focus: [
      "当前毕业去向、材料或手续、实习/就业/升学准备、尚未完成事项、对未来的打算、班主任提醒与祝愿、后续需跟进事项",
      "体现“毕业节点上的总结与提醒”，兼顾关心与事务提醒",
    ],
    avoid: ["空泛煽情", "写成毕业寄语", "无依据写去向已确定"],
  },
];

/** 从谈话主题 / 事件类型匹配最贴近的场景；匹配不到时返回 undefined。 */
export function matchScenario(topic: string): ScenarioSpec | undefined {
  const text = topic ?? "";
  if (!text.trim()) return undefined;
  // 优先精确命中场景名（去掉空格与斜杠后再比对），避免关键词误伤。
  const normalized = text.replace(/\s+/g, "");
  for (const scenario of SCENARIOS) {
    const name = scenario.name.replace(/\s+/g, "");
    if (normalized.includes(name)) return scenario;
  }
  let best: ScenarioSpec | undefined;
  let bestScore = 0;
  for (const scenario of SCENARIOS) {
    // 强特征词权重 3、普通关键词权重 1，避免「结果词」压过「原因词」。
    let score = 0;
    for (const keyword of scenario.strong ?? [])
      if (text.includes(keyword)) score += 3;
    for (const keyword of scenario.keywords)
      if (text.includes(keyword)) score += 1;
    if (score > bestScore) {
      best = scenario;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : undefined;
}

/** 从源文本里提取「谈话主题：X」或事件类型等场景线索。 */
export function extractScenarioTopic(source: string): string {
  const labeled = source.match(/谈话主题[:：]\s*([^\n]+)/);
  if (labeled) return labeled[1].trim();
  // buildMinimumTalkSource 用「已确认事实」携带事件 type，主题可能藏在首行任务之外，
  // 这里回退为整段文本，交给 matchScenario 做关键词匹配。
  return source;
}

export function buildScenarioPrompt(topic: string): string {
  const scenario = matchScenario(topic);
  if (!scenario) {
    // 未匹配到具体场景时，给一套通用的、不含臆断的中性场景要求。
    return [
      "本次谈话未指定具体场景，请按输入内容客观整理，",
      "不套用任何预设的问题框架，也不补充输入中没有的情况。",
    ].join("\n");
  }
  const lines: string[] = [];
  lines.push(`本次谈话属于「${scenario.name}」场景，请围绕该场景的要点整理：`);
  if (scenario.focus.length) {
    lines.push("");
    lines.push("应重点关注并突出：");
    for (const item of scenario.focus) lines.push(`- ${item}`);
  }
  if (scenario.avoid.length) {
    lines.push("");
    lines.push("应避免：");
    for (const item of scenario.avoid) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* 3. Personal Style Prompt：个人模板决定「怎么写」                      */
/* ------------------------------------------------------------------ */

/** 把个人谈话模板转成风格指令。场景 Prompt 决定写什么，个人模板决定怎么写。 */
export function buildPersonalStylePrompt(
  template?: ConversationTemplate,
): string {
  if (!template) return "";
  const tone =
    template.tone === "简洁"
      ? "简洁克制，直陈事实，不铺陈；但不要短到只剩两三句，仍要覆盖背景、情况、引导与跟进。"
      : template.tone === "正式"
        ? "语气正式，用词规范，但保持自然，不要堆砌公文套话。"
        : "语气自然，接近班主任真实口吻，不要显得像新闻稿或思想汇报。";
  const person =
    template.person === "第一人称"
      ? "采用第一人称（班主任“我”）视角。"
      : "采用第三人称（客观陈述）视角。";
  const length = template.defaultLength
    ? `目标字数约 ${template.defaultLength} 字，可根据原始信息丰富程度自动调整，不强行凑字。`
    : "长度根据原始信息丰富程度自动调整，不强行凑字。";
  const highlights: string[] = [];
  if (template.highlightStudentExpression !== false)
    highlights.push("重视学生情况与表达的呈现（不编造学生原话）");
  if (template.highlightCounselorGuidance !== false)
    highlights.push("突出班主任沟通与引导的过程");
  if (template.highlightFollowUp !== false)
    highlights.push("明确写出后续跟进安排，形成工作闭环");
  const writingStyle = template.writingStyle?.trim();
  const customRules = template.customPromptRules?.trim();
  return [
    "写作风格请遵循以下个人模板（它只决定“怎么写”，不能覆盖“不虚构事实”的底线）：",
    `- ${tone}`,
    `- ${person}`,
    `- ${length}`,
    ...(highlights.length ? [`- ${highlights.join("；")}`] : []),
    ...(writingStyle ? [`- ${writingStyle}`] : []),
    ...(template.commonOpening?.trim()
      ? [`- 如自然，可用开头：${template.commonOpening.trim()}`]
      : []),
    ...(template.commonEnding?.trim()
      ? [`- 如自然，可用结尾：${template.commonEnding.trim()}`]
      : []),
    ...(customRules ? [`- 额外要求：${customRules}`] : []),
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 5. 最终输出指令：明确长度目标，防止模型压缩成摘要                      */
/* ------------------------------------------------------------------ */

/**
 * 放在 Prompt 最末的最终指令。
 *
 * 没有这一段时，模型在无长度锚点的情况下会天然输出保守的短摘要——
 * 这正是上一轮「Prompt 改了但效果没变」的直接原因之一。
 */
export function buildFinalOutputInstruction(opts?: {
  targetLength?: number;
}): string {
  const target = opts?.targetLength ?? 400;
  return [
    "现在请直接输出最终谈心谈话记录正文。",
    "不要解释你的工作过程。",
    "不要输出 Prompt。",
    "不要列规则。",
    "不要使用 Markdown 标题。",
    `在现有事实允许的情况下，目标长度约 ${target} 中文字。`,
    "不要把内容压缩成摘要。",
    "正文应自然体现：",
    "1. 为什么进行本次谈话；",
    "2. 学生目前的实际情况；",
    "3. 学生已经表达出的困难或想法；",
    "4. 班主任实际进行了哪些沟通、提醒或引导；",
    "5. 后续准备继续关注或跟进什么。",
    "可以充分展开表达，但不得新增任何未提供的事实。",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 6. 组装：供 PrivacyGateway 调用                                       */
/* ------------------------------------------------------------------ */

export interface TalkPromptLayers {
  system: string;
  scenario: string;
  personalStyle: string;
  fewShot: string;
  finalInstruction: string;
  /** 命中的场景名；未命中时为 undefined。 */
  scenarioName?: string;
  /** 使用的 Few-shot 场景名；无示例时为 undefined。 */
  fewShotName?: string;
}

/**
 * 生成谈话成文的各指令层（不含 User Content）。
 *
 * 顺序与需求一致：System → Scenario → Personal Style → Few-shot → User Content → Final Instruction。
 * User Content 由 PrivacyGateway 在脱敏并人工确认后单独拼入，因此这里返回结构化分层，
 * 既便于测试，也便于调试面板逐层展示。
 */
export function buildTalkPromptLayers(opts: {
  scenarioTopic: string;
  template?: ConversationTemplate;
}): TalkPromptLayers {
  const scenario = matchScenario(opts.scenarioTopic);
  const fewShot = fewShotFor(scenario);
  const targetLength = opts.template?.defaultLength ?? 400;
  return {
    system: buildSystemPrompt(),
    scenario: buildScenarioPrompt(opts.scenarioTopic),
    personalStyle: opts.template
      ? buildPersonalStylePrompt(opts.template)
      : "",
    fewShot: buildFewShotPrompt(fewShot),
    finalInstruction: buildFinalOutputInstruction({ targetLength }),
    scenarioName: scenario?.name,
    fewShotName: fewShot?.scenario,
  };
}

/**
 * 组装谈话成文的最终 Prompt（不含 User Content）。
 * PrivacyGateway 会把去标识化且人工确认后的 payload 拼在 Few-shot 之后。
 */
export function buildTalkPromptPrefix(opts: {
  scenarioTopic: string;
  template?: ConversationTemplate;
}): string {
  const layers = buildTalkPromptLayers(opts);
  return [
    layers.system,
    "",
    layers.scenario,
    ...(layers.personalStyle ? ["", layers.personalStyle] : []),
    ...(layers.fewShot ? ["", layers.fewShot] : []),
  ].join("\n");
}
