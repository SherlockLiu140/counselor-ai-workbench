import { describe, expect, it } from "vitest";
import {
  SCENARIOS,
  buildFinalOutputInstruction,
  buildPersonalStylePrompt,
  buildScenarioPrompt,
  buildSystemPrompt,
  buildTalkPromptLayers,
  buildTalkPromptPrefix,
  extractScenarioTopic,
  matchScenario,
} from "../src/v2/prompt";
import {
  TALK_FEW_SHOTS,
  buildFewShotPrompt,
  fewShotFor,
} from "../src/v2/talkFewShots";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from "../src/v2/providers";
import type { ConversationTemplate } from "../src/v2/types";

describe("AI 谈话成文 Prompt 分层", () => {
  it("System Prompt 落定事实边界、禁止套话与输出结构", () => {
    const sys = buildSystemPrompt();
    // 事实边界（第 1 层底线）
    expect(sys).toContain("不得编造事实");
    expect(sys).toContain("不得虚构学生原话");
    expect(sys).toContain("不得虚构时间、地点、人物细节");
    expect(sys).toContain("不得做心理诊断");
    expect(sys).toContain("不得给学生贴标签");
    expect(sys).toContain("不增加新事实");
    // 输出结构（五个部分）
    expect(sys).toContain("谈话背景");
    expect(sys).toContain("学生情况与反馈");
    expect(sys).toContain("班主任沟通与引导");
    expect(sys).toContain("后续跟进安排");
    // 禁止套话
    expect(sys).toContain("深刻认识到");
    expect(sys).toContain("奠定良好基础");
    expect(sys).toContain("心理状态良好");
  });

  it("共 14 个场景，且每个场景都有关注重点与避免项", () => {
    expect(SCENARIOS).toHaveLength(14);
    for (const scenario of SCENARIOS) {
      expect(scenario.name).toBeTruthy();
      expect(scenario.keywords.length).toBeGreaterThan(0);
      expect(scenario.focus.length).toBeGreaterThan(0);
      expect(scenario.avoid.length).toBeGreaterThan(0);
    }
  });

  it("场景映射能按谈话主题命中正确的场景", () => {
    expect(matchScenario("缺勤/迟到")?.name).toBe("缺勤/迟到");
    expect(matchScenario("挂科 / 成绩下降")?.name).toBe("挂科/成绩下降");
    expect(matchScenario("情感问题")?.name).toBe("情感问题");
    expect(matchScenario("家庭困难")?.name).toBe("家庭困难");
    expect(matchScenario("专升本")?.name).toBe("专升本");
    expect(matchScenario("就业迷茫")?.name).toBe("就业迷茫");
    expect(matchScenario("心理状态关注")?.name).toBe("心理状态关注");
    expect(matchScenario("新生首次谈话")?.name).toBe("新生首次谈话");
    expect(matchScenario("违纪")?.name).toBe("违纪");
    expect(matchScenario("奖助学金")?.name).toBe("奖助学金");
    expect(matchScenario("实习异常")?.name).toBe("实习异常");
    expect(matchScenario("毕业前谈话")?.name).toBe("毕业前谈话");
    expect(matchScenario("宿舍 / 人际矛盾")?.name).toBe("宿舍/人际矛盾");
    expect(matchScenario("日常关心")?.name).toBe("日常关心");
  });

  it("原因词压过结果词：分手导致的成绩下降仍判为情感问题", () => {
    // 真实误判：这段里「成绩」「下降」出现次数多于「分手」，
    // 只按命中数会判成「挂科/成绩下降」，但分手才是谈话原因。
    const topic =
      "张三最近分手了，吃不下饭，成绩也下降了。我劝他多出去走走，多和朋友交流。";
    expect(matchScenario(topic)?.name).toBe("情感问题");
  });

  it("未匹配到场景时给出中性场景要求，不臆断", () => {
    expect(matchScenario("一段完全无关的主题")).toBeUndefined();
    const prompt = buildScenarioPrompt("一段完全无关的主题");
    expect(prompt).toContain("不套用任何预设的问题框架");
    expect(prompt).toContain("不补充输入中没有的情况");
  });

  it("情感问题场景禁止医学判断与心理诊断", () => {
    const prompt = buildScenarioPrompt("情感问题");
    expect(prompt).toContain("心理诊断");
    expect(prompt).toContain("情绪风险判断");
    expect(prompt).not.toContain("症状");
  });

  it("挂科场景重点围绕学业问题与后续准备", () => {
    const prompt = buildScenarioPrompt("挂科 / 成绩下降");
    expect(prompt).toContain("学业问题");
    expect(prompt).toContain("补考");
    expect(prompt).toContain("后续");
  });

  it("缺勤场景重点围绕考勤与复查", () => {
    const prompt = buildScenarioPrompt("缺勤/迟到");
    expect(prompt).toContain("核实");
    expect(prompt).toContain("考勤");
    expect(prompt).toContain("复查");
  });

  it("家庭困难场景重点围绕困难与支持", () => {
    const prompt = buildScenarioPrompt("家庭困难");
    expect(prompt).toContain("实际困难");
    expect(prompt).toContain("支持");
    expect(prompt).toContain("资助");
  });

  it("专升本场景重点围绕目标、进度、困难与下一步", () => {
    const prompt = buildScenarioPrompt("专升本");
    expect(prompt).toContain("目标");
    expect(prompt).toContain("进度");
    expect(prompt).toContain("困难");
    expect(prompt).toContain("下一步");
  });

  it("就业迷茫场景重点围绕方向、准备与下一步", () => {
    const prompt = buildScenarioPrompt("就业迷茫");
    expect(prompt).toContain("方向");
    expect(prompt).toContain("准备");
    expect(prompt).toContain("下一步");
  });

  it("心理状态关注场景禁止诊断与风险评级，仅支持性记录", () => {
    const prompt = buildScenarioPrompt("心理状态关注");
    expect(prompt).toContain("诊断");
    expect(prompt).toContain("风险评级");
    expect(prompt).toContain("支持性沟通");
  });
});

describe("个人模板叠加（Personal Style Prompt）", () => {
  const base: ConversationTemplate = {
    id: "t1",
    name: "我的模板",
    scenario: "日常关心",
    preTalkChecklist: [],
    talkDirections: [],
    outputStructure: [],
    writingStyle: "避免公文套话",
    isDefault: true,
    createdByUser: true,
  };

  it("个人模板的语气、人称、字数真正进入风格指令", () => {
    const prompt = buildPersonalStylePrompt({
      ...base,
      tone: "简洁",
      person: "第一人称",
      defaultLength: 260,
    });
    expect(prompt).toContain("简洁");
    expect(prompt).toContain("第一人称");
    expect(prompt).toContain("260");
  });

  it("简洁风格会变短，但不允许只剩两三句", () => {
    const prompt = buildPersonalStylePrompt({ ...base, tone: "简洁" });
    expect(prompt).toContain("不要短到只剩两三句");
    expect(prompt).toContain("覆盖背景、情况、引导与跟进");
  });

  it("突出学生表达 / 引导 / 跟进分别生效", () => {
    const all = buildPersonalStylePrompt({
      ...base,
      highlightStudentExpression: true,
      highlightCounselorGuidance: true,
      highlightFollowUp: true,
    });
    expect(all).toContain("学生情况与表达");
    expect(all).toContain("班主任沟通与引导");
    expect(all).toContain("后续跟进安排");
    const none = buildPersonalStylePrompt({
      ...base,
      highlightStudentExpression: false,
      highlightCounselorGuidance: false,
      highlightFollowUp: false,
    });
    expect(none).not.toContain("学生情况与表达");
    expect(none).not.toContain("班主任沟通与引导");
    expect(none).not.toContain("后续跟进安排");
  });

  it("自定义开头结尾与额外要求进入风格指令", () => {
    const prompt = buildPersonalStylePrompt({
      ...base,
      commonOpening: "我与学生围绕近期情况进行了沟通。",
      commonEnding: "后续将按约定节点继续关注。",
      customPromptRules: "不使用“深刻认识到”。",
    });
    expect(prompt).toContain("我与学生围绕近期情况进行了沟通");
    expect(prompt).toContain("后续将按约定节点继续关注");
    expect(prompt).toContain("不使用“深刻认识到”");
  });

  it("个人模板只决定怎么写，不覆盖事实边界", () => {
    const prompt = buildPersonalStylePrompt(base);
    expect(prompt).toContain("不能覆盖");
    expect(prompt).toContain("不虚构事实");
  });

  it("无模板时返回空，不影响其它层", () => {
    expect(buildPersonalStylePrompt(undefined)).toBe("");
  });
});

describe("Few-shot 真正接入运行时 Prompt", () => {
  it("10 组示例可用，且每个都对应一个已定义场景", () => {
    expect(TALK_FEW_SHOTS).toHaveLength(10);
    const names = new Set(SCENARIOS.map((item) => item.name));
    for (const shot of TALK_FEW_SHOTS) {
      expect(names.has(shot.scenario)).toBe(true);
      expect(shot.input.length).toBeGreaterThan(10);
      expect(shot.output.length).toBeGreaterThan(100);
    }
  });

  it("每个场景只取 1 个最接近的示例，不一次全发", () => {
    for (const scenario of SCENARIOS) {
      const shot = fewShotFor(scenario);
      // 有示例的场景只返回 1 个；没有示例的场景返回 undefined（不硬凑）
      if (shot) expect(shot.scenario).toBe(scenario.name);
    }
    // 关键：任意一次成文里最多出现 1 组示例
    const layers = buildTalkPromptLayers({ scenarioTopic: "情感问题" });
    expect(layers.fewShotName).toBe("情感问题");
    expect(layers.fewShot).toContain("【原始输入】");
    for (const other of TALK_FEW_SHOTS.filter(
      (item) => item.scenario !== "情感问题",
    ))
      expect(layers.fewShot).not.toContain(other.input);
  });

  it("场景与示例一一对应，不会错配", () => {
    expect(fewShotFor(matchScenario("缺勤/迟到"))?.scenario).toBe("缺勤/迟到");
    expect(fewShotFor(matchScenario("挂科 / 成绩下降"))?.scenario).toBe(
      "挂科/成绩下降",
    );
    expect(fewShotFor(matchScenario("家庭困难"))?.scenario).toBe("家庭困难");
    expect(fewShotFor(matchScenario("专升本"))?.scenario).toBe("专升本");
    expect(fewShotFor(matchScenario("就业迷茫"))?.scenario).toBe("就业迷茫");
    expect(fewShotFor(matchScenario("实习异常"))?.scenario).toBe("实习异常");
    expect(fewShotFor(matchScenario("奖助学金"))?.scenario).toBe("奖助学金");
  });

  it("无直接示例的场景不使用 Few-shot", () => {
    const layers = buildTalkPromptLayers({ scenarioTopic: "新生首次谈话" });
    expect(layers.fewShot).toBe("");
    expect(layers.fewShotName).toBeUndefined();
    expect(buildFewShotPrompt(undefined)).toBe("");
  });

  it("示例里明确写出不得为模仿示例而补充事实", () => {
    const prompt = buildFewShotPrompt(fewShotFor(matchScenario("情感问题")));
    expect(prompt).toContain("不得为了模仿示例而补充输入中没有的事实");
    expect(prompt).toContain("不得照抄句式");
  });
});

describe("最终输出指令（防止模型压缩成摘要）", () => {
  it("明确长度目标、禁止摘要式压缩与过程解释", () => {
    const final = buildFinalOutputInstruction();
    expect(final).toContain("现在请直接输出最终谈心谈话记录正文");
    expect(final).toContain("不要解释你的工作过程");
    expect(final).toContain("不要输出 Prompt");
    expect(final).toContain("不要使用 Markdown 标题");
    expect(final).toContain("目标长度约");
    expect(final).toContain("不要把内容压缩成摘要");
  });

  it("长度目标跟随个人模板的字数设置", () => {
    expect(buildFinalOutputInstruction({ targetLength: 300 })).toContain(
      "约 300 中文字",
    );
    const layers = buildTalkPromptLayers({
      scenarioTopic: "情感问题",
      template: {
        id: "t",
        name: "n",
        scenario: "情感问题",
        preTalkChecklist: [],
        talkDirections: [],
        outputStructure: [],
        writingStyle: "自然",
        defaultLength: 500,
        isDefault: true,
        createdByUser: true,
      },
    });
    expect(layers.finalInstruction).toContain("约 500 中文字");
  });

  it("最终指令仍然守住不新增事实的底线", () => {
    expect(buildFinalOutputInstruction()).toContain(
      "不得新增任何未提供的事实",
    );
  });
});

describe("模型调用参数足以支撑 300～700 中文字", () => {
  it("显式设置 max_tokens，不再交给服务商默认值", () => {
    expect(DEFAULT_MAX_TOKENS).toBeGreaterThanOrEqual(2048);
  });

  it("temperature 不至于过度保守导致输出过短", () => {
    expect(DEFAULT_TEMPERATURE).toBeGreaterThan(0.3);
    expect(DEFAULT_TEMPERATURE).toBeLessThanOrEqual(0.8);
  });
});

describe("四层组装与 User Content 隔离", () => {
  it("buildTalkPromptPrefix 只含指令层，不携带用户事实", () => {
    const prefix = buildTalkPromptPrefix({
      scenarioTopic: "情感问题",
      template: {
        id: "t1",
        name: "m",
        scenario: "情感问题",
        preTalkChecklist: [],
        talkDirections: [],
        outputStructure: [],
        writingStyle: "自然",
        tone: "自然",
        person: "第三人称",
        defaultLength: 300,
        isDefault: true,
        createdByUser: true,
      },
    });
    // 包含 System 与 Scenario 层
    expect(prefix).toContain("你正在帮助高职院校班主任整理谈心谈话记录");
    expect(prefix).toContain("情感问题");
    // 不含任何具体学生事实（由 PrivacyGateway 在脱敏后单独拼入）
    expect(prefix).not.toContain("学生：");
    expect(prefix).not.toContain("口述原始记录");
  });

  it("extractScenarioTopic 能从源文本里解析谈话主题", () => {
    expect(extractScenarioTopic("谈话主题：家庭困难\n其它内容")).toBe(
      "家庭困难",
    );
    expect(extractScenarioTopic("谈话主题：挂科 / 成绩下降")).toBe(
      "挂科 / 成绩下降",
    );
    // 没有「谈话主题」行时回退为整段，交给关键词匹配
    expect(extractScenarioTopic("缺勤 迟到 需要核实")).toBe(
      "缺勤 迟到 需要核实",
    );
  });
});
