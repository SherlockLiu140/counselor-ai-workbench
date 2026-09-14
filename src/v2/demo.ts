import { demoStudents } from "../demo/data";
import { emptyV2Space, migrateV1Space } from "./store";
import { formatConversationRecord } from "./workflow";
import type { Student as V1Student } from "../engine/types";
import type { ConversationDraft, ConversationSubject } from "./workflow";
import type { GraduationDirection, V2Space } from "./types";

const surnames = ["林", "周", "陈", "陆", "沈", "许", "方", "宋", "叶", "苏"];
const given = [
  "知禾",
  "星原",
  "书宁",
  "以安",
  "南乔",
  "沐言",
  "景初",
  "明溪",
  "予宁",
  "望舒",
];

export function demoV2Students100(): V1Student[] {
  return Array.from({ length: 100 }, (_, index) => {
    if (index < demoStudents.length)
      return {
        ...demoStudents[index],
        className:
          index < 50 ? "2025级虚构信息技术1班" : "2025级虚构电子商务2班",
      };
    const no = `2026${String(index + 1).padStart(4, "0")}`;
    return {
      id: `student:${no}`,
      studentId: no,
      name: `${surnames[index % surnames.length]}${given[Math.floor(index / 10) % given.length]}${String(index + 1).padStart(2, "0")}`,
      className: index < 50 ? "2025级虚构信息技术1班" : "2025级虚构电子商务2班",
      phone: `1390000${String(index + 1).padStart(4, "0")}`,
      email: `v2student${index + 1}@example.invalid`,
      dorm: `${index < 50 ? 1 : 2}栋${301 + (index % 20)}室`,
    };
  });
}

export function createDemoV2Space(): V2Space {
  const timestamp = "2026-09-10T08:00:00.000Z";
  const base = migrateV1Space({ students: demoV2Students100() }, timestamp);

  /** 与 selectors 的 `day()` 同口径（UTC 日历日），演示日期随当天推移。 */
  const dayOffset = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  // —— 毕业方向：按配额展开后做确定性交错（步长与 100 互质），
  //    总数与配额一致且分布交错，避免「四类各 25」的均匀假象。 ——
  const directionQuota: Array<[GraduationDirection, number]> = [
    ["就业", 38],
    ["专升本", 31],
    ["考公考编", 12],
    ["未明确", 16],
    ["其他", 2],
    ["创业", 1],
  ];
  const directionPool = directionQuota.flatMap(([direction, count]) =>
    Array<string>(count).fill(direction),
  );
  const shuffledDirections = directionPool.map(
    (_, index) => directionPool[(index * 37) % 100],
  );

  base.students.forEach((student, index) => {
    student.currentRole =
      index === 0 ? "班长" : index === 1 ? "学习委员" : undefined;
    student.graduationDirection = shuffledDirections[
      index
    ] as typeof student.graduationDirection;
    student.tags =
      index === 2 || index % 13 === 0 ? ["资助材料待核实"] : [];
    student.specialCare = index < 12;
    student.careTypes = index >= 12
      ? []
      : index % 4 === 0
        ? ["家庭困难", "学业困难"]
        : index % 4 === 1
          ? ["心理状态关注"]
          : index % 4 === 2
            ? ["学业困难"]
            : ["升学就业长期无进展"];
    student.formerRoles = index === 2 ? "生活委员" : undefined;
    student.importedLastTalkDate = index < 12 ? `2026-08-${String(10 + index).padStart(2, "0")}` : undefined;
    student.importedTaskCount = index < 12 ? index % 3 : 0;
    // 演示链主角的工作状态与底层事件 / 待办保持一致：
    // 林知禾（0）与陆书宁（3）有待谈话，宋景初（7）在跟进中。
    if (index === 0 || index === 3) student.status = "待谈话";
    if (index === 7) student.status = "跟进中";
  });
  base.sensitiveProfiles.push(
    { studentId: base.students[0].id, familySituation: "家庭经济情况需持续关注（虚构）", customFields: [] },
    { studentId: base.students[1].id, psychologicalNotes: "近期状态需定期沟通（虚构）", customFields: [] },
    { studentId: base.students[20].id, religion: "虚构信教情况", customFields: [] },
    { studentId: base.students[21].id, sexualOrientation: "虚构性取向记录", customFields: [] },
  );

  // —— 考勤：最近 7 天刻意不均匀的分布（对应 6 天前 → 今天），
  //    首页「近 7 天考勤变化」直接由这批记录聚合而来。 ——
  const attendanceSpread = [4, 2, 6, 3, 5, 2, 7];
  const attendanceOffsets = attendanceSpread.flatMap((count, dayIndex) =>
    Array<number>(count).fill(dayIndex - 6),
  );
  base.attendanceRecords = attendanceOffsets.map((offset, index) => ({
    id: `attendance:demo-${index}`,
    studentId: base.students[(index * 5) % 12].id,
    date: dayOffset(offset),
    course: "虚构课程",
    type: index % 4 === 0 ? "absent" : index % 3 === 0 ? "late" : "leave",
    source: "虚构演示数据",
  }));

  // —— 学业：前 16 人两学期正常成绩；另 13 人挂科（9 人 1 门、4 人 2 门）、
  //    2 人最近成绩下滑。首页「学业状态分布」为 87 / 9 / 4。 ——
  base.academicRecords = base.students
    .slice(0, 16)
    .flatMap((student, index) => [
      {
        id: `academic:${index}-a`,
        studentId: student.id,
        term: "2025-2026-1",
        course: "虚构专业课",
        score: 78 - (index % 6),
        rank: 20 + index,
        failed: false,
        source: "虚构演示数据",
        importedAt: timestamp,
      },
      {
        id: `academic:${index}-b`,
        studentId: student.id,
        term: "2025-2026-2",
        course: "虚构专业课",
        score: 80 - (index % 5),
        rank: 16 + index,
        failedCount: 0,
        failed: false,
        source: "虚构演示数据",
        importedAt: timestamp,
      },
    ]);
  const failedOnce = [6, 11, 15, 18, 22, 25, 29, 55, 61];
  const failedMulti = [13, 27, 66, 72];
  const failedCourses = ["虚构高等数学", "虚构专业英语"];
  const decliningStudents = [9, 12];
  base.academicRecords.push(
    ...failedOnce.map((studentIndex) => ({
      id: `academic:fail-${studentIndex}`,
      studentId: base.students[studentIndex].id,
      term: "2025-2026-2",
      course: failedCourses[studentIndex % 2],
      score: 58 - (studentIndex % 3),
      failed: true,
      source: "虚构演示数据",
      importedAt: timestamp,
    })),
    ...failedMulti.flatMap((studentIndex) =>
      failedCourses.map((course, courseIndex) => ({
        id: `academic:fail-${studentIndex}-${courseIndex}`,
        studentId: base.students[studentIndex].id,
        term: "2025-2026-2",
        course,
        score: 55 + courseIndex * 2,
        failed: true,
        source: "虚构演示数据",
        importedAt: timestamp,
      })),
    ),
    ...decliningStudents.flatMap((studentIndex, group) => [
      {
        id: `academic:trend-${studentIndex}-previous`,
        studentId: base.students[studentIndex].id,
        term: "上次",
        course: "虚构专业课",
        score: 82 - group,
        failed: false,
        source: "虚构演示数据",
        importedAt: timestamp,
      },
      {
        id: `academic:trend-${studentIndex}-latest`,
        studentId: base.students[studentIndex].id,
        term: "最近",
        course: "虚构专业课",
        score: 70 - group,
        failed: false,
        source: "虚构演示数据",
        importedAt: timestamp,
      },
    ]),
  );

  // —— 待办（顺序与到期分布保持原有口径，today-board 测试依赖）——
  base.tasks = [
    {
      id: "task:demo-1",
      studentId: base.students[2].id,
      type: "待收材料",
      title: "核实国家助学金补交材料",
      dueAt: dayOffset(-3),
      priority: "high",
      status: "待处理",
      createdAt: timestamp,
    },
    {
      id: "task:demo-2",
      studentId: base.students[5].id,
      type: "待联系",
      title: "联系家长确认请假流程",
      dueAt: dayOffset(-1),
      priority: "medium",
      status: "待处理",
      createdAt: timestamp,
    },
    {
      id: "task:demo-3",
      studentId: base.students[0].id,
      eventId: "event:demo-1",
      type: "待谈话",
      title: "就缺勤与迟到情况与学生谈话",
      dueAt: dayOffset(0),
      priority: "high",
      status: "待处理",
      createdAt: timestamp,
    },
    {
      id: "task:demo-4",
      studentId: base.students[7].id,
      eventId: "event:demo-2",
      conversationId: "conversation:demo-1",
      type: "待复查",
      title: "复查上周谈话约定的落实情况",
      dueAt: dayOffset(0),
      priority: "medium",
      status: "待处理",
      createdAt: timestamp,
    },
    {
      id: "task:demo-5",
      studentId: base.students[1].id,
      type: "待谈话",
      title: "跟进专升本复习计划制定情况",
      priority: "medium",
      status: "待处理",
      createdAt: timestamp,
    },
    {
      id: "task:demo-6",
      studentId: base.students[3].id,
      eventId: "event:demo-3",
      type: "待谈话",
      title: "了解近期作息与情绪状态",
      priority: "high",
      status: "待处理",
      createdAt: timestamp,
    },
    {
      id: "task:demo-7",
      type: "待回填学工系统",
      title: "回填本周考勤异常记录",
      dueAt: dayOffset(0),
      priority: "low",
      status: "待处理",
      createdAt: timestamp,
    },
    {
      id: "task:demo-8",
      studentId: base.students[4].id,
      type: "待回访",
      title: "回访实习岗位适应情况",
      dueAt: dayOffset(2),
      priority: "medium",
      status: "待处理",
      createdAt: timestamp,
    },
  ] as V2Space["tasks"];

  // —— 事务：与待办、谈话互相关联，构成可走完的演示链 ——
  base.events = [
    {
      // 演示链 1 前史：林知禾 9 月初的迟到，已谈话并结案，供材料输出复用。
      id: "event:demo-0",
      studentId: base.students[0].id,
      type: "迟到",
      occurredAt: dayOffset(-9),
      sourceType: "teacher",
      sourceText: "任课教师反馈（虚构）",
      facts: "虚构事实：一周内多次专业课迟到，均在一刻钟以内。",
      priority: "medium",
      status: "已结案",
      needsConversation: false,
      needsFollowUp: false,
      relatedConversationIds: ["conversation:demo-2"],
      relatedTaskIds: [],
      result: "复查确认未再迟到，谈话事项结案。",
      closedAt: dayOffset(-1),
      createdAt: timestamp,
    },
    {
      // 演示链 1：林知禾缺勤 → 待谈话（待办 task:demo-3）→ 谈话 → 跟进 → 结案。
      id: "event:demo-1",
      studentId: base.students[0].id,
      type: "缺勤",
      occurredAt: dayOffset(-3),
      sourceType: "class_committee",
      sourceText: "班委反馈（虚构）",
      facts: "虚构事实：本周一、周二上午专业课未到，班委两次提醒未果，原因待核实。",
      priority: "high",
      status: "已安排谈话",
      needsConversation: true,
      needsFollowUp: true,
      relatedConversationIds: [],
      relatedTaskIds: ["task:demo-3"],
      createdAt: timestamp,
    },
    {
      // 宋景初：上周谈话已完成，事件跟进中，复查待办 task:demo-4 今天到期。
      id: "event:demo-2",
      studentId: base.students[7].id,
      type: "其他",
      occurredAt: dayOffset(-8),
      sourceType: "teacher",
      sourceText: "任课教师反馈（虚构）",
      facts: "虚构事实：近两周课堂互动明显减少，作业按时提交，约谈了解近期状态。",
      priority: "medium",
      status: "跟进中",
      needsConversation: true,
      needsFollowUp: true,
      relatedConversationIds: ["conversation:demo-1"],
      relatedTaskIds: ["task:demo-4"],
      result: "已完成一次谈话，按约定今天复查落实情况。",
      createdAt: timestamp,
    },
    {
      // 陆书宁：室友反映作息与情绪波动，已安排谈话（task:demo-6）。
      id: "event:demo-3",
      studentId: base.students[3].id,
      type: "心理状态关注",
      occurredAt: dayOffset(-1),
      sourceType: "class_committee",
      sourceText: "班委反馈（虚构）",
      facts: "虚构事实：室友反映近期作息颠倒、上课经常打瞌睡，具体原因待当面了解。",
      priority: "high",
      status: "已安排谈话",
      needsConversation: true,
      needsFollowUp: false,
      relatedConversationIds: [],
      relatedTaskIds: ["task:demo-6"],
      createdAt: timestamp,
    },
    {
      // 许南乔：更早的一起人际矛盾，已调解结案，展示事务中心的完整生命周期。
      id: "event:demo-4",
      studentId: base.students[5].id,
      type: "人际矛盾",
      occurredAt: dayOffset(-12),
      sourceType: "self",
      sourceText: "学生本人反映（虚构）",
      facts: "虚构事实：与室友因作息问题发生口角，经调解双方已达成一致。",
      priority: "medium",
      status: "已结案",
      needsConversation: false,
      needsFollowUp: false,
      relatedConversationIds: [],
      relatedTaskIds: [],
      result: "已调解并经双方确认，宿舍关系恢复正常。",
      closedAt: dayOffset(-6),
      createdAt: timestamp,
    },
  ] as V2Space["events"];

  // —— 谈心谈话：四条已完成记录，格式由 formatConversationRecord 统一成文 ——
  const songTalk: ConversationDraft = {
    happenedAt: dayOffset(-7),
    location: "学生工作办公室",
    rawNotes: "约宋景初了解近两周课堂状态，他提到作息变晚、上课容易走神。",
    studentExpression: "自述最近休息不好，上课注意力下降，其他方面正常。",
    counselorGuidance:
      "一起核对了作息安排，建议先从固定睡觉时间入手，并保持当前作业节奏。",
    agreements: "本周尝试固定 23 点前休息；班委继续正常反馈课堂情况。",
    followUpPlan: "一周后复查作息调整与课堂状态。",
  };
  const linTalk: ConversationDraft = {
    happenedAt: dayOffset(-8),
    location: "教学楼自习室",
    rawNotes: "就多次迟到与林知禾谈话，她说明通勤路线调整导致早起困难。",
    studentExpression: "认可迟到影响，表示已重新规划通勤与起床时间。",
    counselorGuidance: "一起核对了课程表与通勤时间，约定观察一周不再迟到。",
    agreements: "调整起床闹钟与通勤路线；一周内由本人反馈执行情况。",
    followUpPlan: "一周后确认未再迟到，即可结案。",
  };
  const shenTalk: ConversationDraft = {
    happenedAt: dayOffset(-4),
    location: "学生工作办公室",
    rawNotes: "与沈以安了解家庭经济情况对学业的影响，他目前课余做兼职。",
    studentExpression: "兼职占用部分复习时间，但能够平衡，暂时不想减少工时。",
    counselorGuidance: "提醒优先保障课程，并介绍了校内勤工助学岗位的资源。",
    agreements: "保持当前兼职节奏，期中前如成绩下滑优先调整。",
    followUpPlan: "期中考试后回访学业与兼职的平衡情况。",
  };
  const zhouTalk: ConversationDraft = {
    happenedAt: dayOffset(-5),
    location: "线上语音",
    rawNotes: "与周星原对齐专升本目标，他已选定院校和专业，但复习计划未落地。",
    studentExpression: "担心一边上课一边备考时间不够，复习计划迟迟没有排出来。",
    counselorGuidance: "一起把考试科目拆到周维度，先做出第一版周计划再逐步调整。",
    agreements: "三天内产出第一版复习周计划，先覆盖两门基础课。",
    followUpPlan: "三天后检查计划初稿，之后每周固定跟进一次。",
  };
  const talkSubject = (type: string, facts: string): ConversationSubject => ({
    type,
    facts,
  });
  base.conversations = [
    {
      id: "conversation:demo-1",
      studentId: base.students[7].id,
      eventId: "event:demo-2",
      scenario: "日常关心",
      ...songTalk,
      finalRecord: formatConversationRecord(
        base.students[7].name,
        talkSubject("其他", "近两周课堂互动减少，作业按时提交。"),
        songTalk,
      ),
      nextFollowUpAt: dayOffset(0),
      aiUsed: false,
      createdAt: timestamp,
    },
    {
      id: "conversation:demo-2",
      studentId: base.students[0].id,
      eventId: "event:demo-0",
      scenario: "迟到",
      ...linTalk,
      finalRecord: formatConversationRecord(
        base.students[0].name,
        talkSubject("迟到", "一周内多次专业课迟到，均在一刻钟以内。"),
        linTalk,
      ),
      nextFollowUpAt: dayOffset(-1),
      aiUsed: false,
      createdAt: timestamp,
    },
    {
      id: "conversation:demo-3",
      studentId: base.students[4].id,
      scenario: "家庭困难",
      ...shenTalk,
      finalRecord: formatConversationRecord(
        base.students[4].name,
        talkSubject("家庭困难", "家庭经济压力较大，目前课余兼职补贴生活。"),
        shenTalk,
      ),
      aiUsed: false,
      createdAt: timestamp,
    },
    {
      id: "conversation:demo-4",
      studentId: base.students[1].id,
      scenario: "升学规划",
      ...zhouTalk,
      finalRecord: formatConversationRecord(
        base.students[1].name,
        talkSubject("专升本", "已确定报考院校与专业，复习计划尚未制定。"),
        zhouTalk,
      ),
      nextFollowUpAt: dayOffset(2),
      aiUsed: false,
      createdAt: timestamp,
    },
  ] as V2Space["conversations"];

  // —— 升学就业档案：周星原的计划明确「未制定」，与首页待办互相印证 ——
  base.careerPlans = [
    {
      studentId: base.students[0].id,
      direction: "专升本",
      furtherStudy: {
        targetSchool: "",
        targetMajor: "软件工程",
        stage: "基础复习",
        planStatus: "未制定",
        recentStudy: "已开始整理基础科目，但还没有形成周计划。",
        lastFollowUp: "2026-08-01",
        nextFollowUp: dayOffset(11),
      },
      updatedAt: timestamp,
    },
    {
      studentId: base.students[1].id,
      direction: "专升本",
      furtherStudy: {
        targetSchool: "虚构应用技术学院",
        targetMajor: "电子商务",
        stage: "准备阶段",
        planStatus: "未制定",
        recentStudy: "已明确目标院校与专业，复习周计划尚未排出来。",
        difficulties: "上课与备考时间冲突，计划一直没有落地。",
        lastFollowUp: dayOffset(-5),
      },
      updatedAt: timestamp,
    },
    {
      studentId: base.students[2].id,
      direction: "就业",
      employment: {
        targetRole: "前端开发助理",
        preferredRegion: "本市",
        resumeStatus: "无简历",
        applications: 0,
        interviews: 0,
        offers: 0,
        signed: false,
        lastFollowUp: "2026-07-15",
        nextStep: "完成第一版简历",
      },
      updatedAt: timestamp,
    },
    {
      studentId: base.students[3].id,
      direction: "就业",
      employment: {
        targetRole: "运营助理",
        preferredRegion: "省内",
        resumeStatus: "已完成",
        applications: 8,
        interviews: 2,
        offers: 1,
        signed: false,
        lastFollowUp: "2026-09-08",
        nextStep: "核实 offer 条款并决定是否签约",
      },
      updatedAt: timestamp,
    },
    {
      studentId: base.students[4].id,
      direction: "就业",
      employment: {
        targetRole: "电商客服",
        preferredRegion: "本市",
        resumeStatus: "已完成",
        applications: 12,
        interviews: 4,
        offers: 1,
        signed: true,
        internshipCompany: "虚构商贸有限公司",
        currentStatus: "已签约",
        lastFollowUp: "2026-09-09",
        nextStep: "完成入职前材料",
      },
      updatedAt: timestamp,
    },
  ];
  base.careerPlans.forEach((plan) => {
    const student = base.students.find((item) => item.id === plan.studentId);
    if (student) student.graduationDirection = plan.direction;
  });

  // —— 评奖评优：在原项目之外增加「国家助学金」，与陈晨的待办互为印证 ——
  base.awardProjects = [
    {
      id: "award-project:demo-aid",
      name: "2026 年国家助学金评选（虚构）",
      type: "助学金",
      year: "2026",
      term: "2026 秋季学期",
      deadline: dayOffset(5),
      requiredMaterials: ["申请表", "家庭经济困难认定表", "成绩单"],
      notes: "全部为虚构演示数据。",
      createdAt: timestamp,
    },
    {
      id: "award-project:demo-cadre",
      name: "2026 年优秀学生干部评选（虚构）",
      type: "优秀学生干部",
      year: "2026",
      term: "2026 秋季学期",
      deadline: "2026-09-16",
      requiredMaterials: ["申请表", "成绩单", "事迹材料"],
      notes: "全部为虚构演示数据。",
      createdAt: timestamp,
    },
  ];
  base.awardApplications = [
    {
      // 陈晨：待收材料待办（task:demo-1）对应的就是这条申请。
      id: "award-application:demo-aid-1",
      projectId: "award-project:demo-aid",
      studentId: base.students[2].id,
      type: "国家助学金",
      year: "2026",
      eligible: true,
      status: "待补材料",
      requiredMaterials: ["申请表", "家庭经济困难认定表", "成绩单"],
      missingMaterials: ["家庭经济困难认定表"],
      deadline: dayOffset(5),
      notes: "申请表与成绩单已收，家庭经济困难认定表待补交（虚构）。",
    },
    {
      id: "award-application:demo-1",
      projectId: "award-project:demo-cadre",
      studentId: base.students[0].id,
      type: "优秀学生干部",
      year: "2026",
      eligible: true,
      status: "待补材料",
      requiredMaterials: ["申请表", "成绩单", "事迹材料"],
      missingMaterials: ["事迹材料"],
      deadline: "2026-09-16",
      notes: "等待补充虚构事迹材料。",
    },
    {
      id: "award-application:demo-2",
      projectId: "award-project:demo-cadre",
      studentId: base.students[1].id,
      type: "优秀学生干部",
      year: "2026",
      eligible: true,
      status: "已提交",
      requiredMaterials: ["申请表", "成绩单", "事迹材料"],
      missingMaterials: [],
      deadline: "2026-09-16",
      notes: "虚构材料已提交。",
    },
  ];
  return { ...emptyV2Space(), ...base };
}
