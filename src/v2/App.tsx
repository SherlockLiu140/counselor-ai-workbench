import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { RosterPane } from "../components/RosterPane";
import type { Student as V1Student } from "../engine/types";
import { createDemoV2Space } from "./demo";
import { AwardsPane } from "./AwardsPane";
import { CareerPane } from "./CareerPane";
import { MaterialsPane } from "./MaterialsPane";
import { AiPolishDialog } from "./AiPolishDialog";
import { materialTypeLabels, type MaterialType } from "./materials";
import {
  PrivacyGateway,
  buildAcademicTalkSource,
  buildConversationTalkSource,
} from "./PrivacyGateway";
import { TemplateManager } from "./TemplateManager";
import { copyText } from "./clipboard";
import { externalLinkProps } from "./desktop";
import {
  saveStudentSystemUrl,
  shortStudentSystemUrl,
  useStudentSystemUrl,
} from "./externalLinks";
import { TodayBoard } from "./TodayBoard";
import { SpecialCarePane, latestAcademic } from "./SpecialCarePane";
import { exportConversations, sortConversations } from "./export";
import { saveExportFile } from "./desktop";
import {
  addAwardCandidate,
  bulkUpdateAwardStatus,
  careerDirectionCounts,
  careerFilter,
  createAwardProject,
  replaceConversationTemplates,
  saveMaterialArchive,
  updateAwardApplication,
  upsertCareerPlan,
} from "./business";
import {
  dashboardMetrics,
  eventsForStudent,
  filterStudents,
  studentTaskCount,
} from "./selectors";
import {
  V2IndexedStore,
  V2MemoryStore,
  addTaskRecord,
  emptyV2Space,
  importV1Students,
  registerEvent,
  resetV2Space,
  updateStudentCare,
  type V2LocalStore,
} from "./store";
import type {
  ConversationRecord,
  ConversationTemplate,
  EventRecord,
  StudentRecord,
  TaskRecord,
  V2Space,
} from "./types";
import {
  closeEvent,
  completeEventConversation,
  completeTask,
  eventProgress,
  recordStandaloneConversation,
  saveGatewayResult,
} from "./workflow";
import { AiSettingsPane } from "./AiSettingsPane";

type Page =
  | "home"
  | "class"
  | "care"
  | "events"
  | "tasks"
  | "talks"
  | "awards"
  | "career"
  | "materials"
  | "settings";

/**
 * 「AI 润色」弹窗的上下文。
 *
 * 谈话记录卡的「AI 润色」与材料预览区都落到同一个弹窗，
 * 差别只在初始化数据：带 conversationId 时贴回写进那条谈话记录，
 * 否则只把润色结果存成一份材料归档。
 */
interface PolishRequest {
  title: string;
  subtitle?: string;
  sourceText: string;
  scenario?: string;
  templateId?: string;
  studentId?: string;
  conversationId?: string;
  materialType?: MaterialType;
  sourceEventIds?: string[];
  sourceConversationIds?: string[];
}

interface GatewayRequest {
  studentId?: string;
  /** 指定要写回的谈话记录；不给则回退为该生最近一条。 */
  conversationId?: string;
  title: string;
  purpose: "talk" | "award" | "career" | "material";
  sourceText?: string;
  /** 谈话场景主题；缺省时从 sourceText 里解析「谈话主题」行。 */
  scenario?: string;
  /** 谈话个人模板 ID，用于叠加个人风格 Prompt。 */
  templateId?: string;
  awardApplicationId?: string;
  materialType?: string;
  sourceEventIds?: string[];
  sourceConversationIds?: string[];
}

const nav: Array<{ id: Page; label: string; icon: string }> = [
  { id: "home", label: "首页", icon: "⌂" },
  { id: "class", label: "我的班级", icon: "▦" },
  { id: "care", label: "特殊关爱", icon: "⚑" },
  { id: "events", label: "事务", icon: "◇" },
  { id: "tasks", label: "待办", icon: "✓" },
  { id: "talks", label: "谈心谈话", icon: "◎" },
  { id: "awards", label: "评奖评优", icon: "☆" },
  { id: "career", label: "升学就业", icon: "↗" },
  { id: "materials", label: "材料输出", icon: "▤" },
  { id: "settings", label: "AI 设置", icon: "⚙" },
];

const isoDay = () => new Date().toISOString().slice(0, 10);

/** 首页 KPI 卡片的跳转目标：页面 + 可选筛选聚焦（挂科 / 方向 / 待办类型等）。 */
interface KpiTarget {
  page: Page;
  taskType?: string;
  taskScope?: "超期";
  classFocus?: "failed" | "concern";
  careerFilter?: "upgrade" | "no-direction" | "stale";
}
/** 谈心谈话页默认展示的最近谈话条数，超出部分可展开。 */
const RECENT_TALK_COUNT = 5;
const dayAfter = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const sourceLabels = {
  class_committee: "班委反馈",
  teacher: "任课教师反馈",
  system: "系统导入",
  self: "学生本人",
  other: "其他",
};
/** 事件类型与谈话主题共用同一套措辞，避免两处各写一份而漂移。 */
const EVENT_TYPES = [
  "缺勤",
  "迟到",
  "请假异常",
  "挂科",
  "成绩下降",
  "学习困难",
  "班委反馈",
  "任课教师反馈",
  "宿舍问题",
  "人际矛盾",
  "情感问题",
  "家庭困难",
  "心理状态关注",
  "违纪",
  "奖助",
  "评优",
  "实习异常",
  "就业",
  "专升本",
  "特殊关爱跟进",
  "其他",
];

function studentName(space: V2Space, id?: string) {
  return (
    space.students.find((student) => student.id === id)?.name ?? "未关联学生"
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="v2-empty">{children}</div>;
}

export default function App() {
  const params = new URLSearchParams(location.search);
  const demo = params.get("mode") === "demo";
  const session = params.get("mode") === "session";
  const [page, setPage] = useState<Page>("home");
  const [space, setSpace] = useState<V2Space>(emptyV2Space());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>();
  const [eventFormOpen, setEventFormOpen] = useState(false);
  /** 直接发起谈话的表单；带 studentId 时预选学生，带 topic 时预选主题。 */
  const [talkComposer, setTalkComposer] = useState<{
    studentId?: string;
    topic?: string;
  }>();
  const [talkEventId, setTalkEventId] = useState<string>();
  const [gatewayRequest, setGatewayRequest] = useState<GatewayRequest>();
  /** AI 润色弹窗上下文：谈话记录卡与材料预览都用它打开同一个弹窗。 */
  const [polishRequest, setPolishRequest] = useState<PolishRequest>();
  const [moduleStudentId, setModuleStudentId] = useState<string>();
  /** KPI 卡片点击后落到各页面的筛选聚焦；空值表示「全部」。 */
  const [classFocus, setClassFocus] = useState<"failed" | "concern" | "">("");
  const [careerFocus, setCareerFocus] = useState("all");
  const [taskFocus, setTaskFocus] = useState<{
    type?: string;
    scope?: "超期";
  }>({});
  /** 学工系统入口：地址存在本机，第一次点开就地填一次。 */
  const studentSystemUrl = useStudentSystemUrl();
  const [systemLinkEditing, setSystemLinkEditing] = useState(false);
  const [systemLinkDraft, setSystemLinkDraft] = useState("");
  const [systemLinkError, setSystemLinkError] = useState("");
  /**
   * 「清除全部数据」流程。红线：文件备份完成前，「永久清除」不可用；
   * 逃生口「无需备份」必须连点 3 次才放行，且即便如此也会在本地数据库留快照。
   */
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBackupDone, setResetBackupDone] = useState(false);
  const [resetBackupBusy, setResetBackupBusy] = useState(false);
  const [resetSkipCount, setResetSkipCount] = useState(0);
  const [resetBusy, setResetBusy] = useState(false);
  const store = useRef<V2LocalStore | null>(null);

  function commitStudentSystemUrl() {
    try {
      saveStudentSystemUrl(systemLinkDraft);
      setSystemLinkError("");
      setSystemLinkEditing(false);
    } catch (e) {
      setSystemLinkError((e as Error).message);
    }
  }

  /** 整张 KPI 卡片可点：跳到对应页面并带上筛选状态。 */
  function openKpi(target: KpiTarget) {
    setClassFocus(target.classFocus ?? "");
    setCareerFocus(target.careerFilter ?? "all");
    setTaskFocus({ type: target.taskType, scope: target.taskScope });
    setPage(target.page);
  }

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const local = demo
          ? new V2MemoryStore(createDemoV2Space())
          : session
            ? new V2MemoryStore()
            : await V2IndexedStore.open();
        if (disposed) return local.close();
        store.current = local;
        setSpace(await local.read());
        setReady(true);
      } catch (cause) {
        if (!disposed) setError((cause as Error).message);
      }
    })();
    return () => {
      disposed = true;
      store.current?.close();
    };
  }, []);

  const selectedStudent = space.students.find(
    (student) => student.id === selectedStudentId,
  );
  async function commit(action: () => Promise<V2Space>, message?: string) {
    setError("");
    try {
      const next = await action();
      setSpace(next);
      if (message) setNotice(message);
      return next;
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function openStudent(id: string) {
    setSelectedStudentId(id);
    setPage("class");
  }
  function openNewEvent(studentId?: string) {
    if (studentId) setSelectedStudentId(studentId);
    setEventFormOpen(true);
  }
  /**
   * 直接发起一次谈心谈话。
   *
   * 原实现（`startCareTalk`）会先 `registerEvent(needsConversation: true)`，
   * 于是「发起谈话」先弹「登记一件事」，还要顺带生成一条「待谈话」待办；
   * 而谈话当场就发生了，那条待办建立即作废。现在改为直接打开谈话表单：
   * 不强制登记事件、不生成待谈话待办，是否归档到「事务」由老师在表单里勾选。
   */
  function openTalkComposer(student?: StudentRecord, topic?: string) {
    setTalkComposer({ studentId: student?.id, topic });
  }
  /**
   * 从待办发起谈话：
   * - 已关联事件的待办，直接打开对应谈话表单；
   * - 独立待办（无事件）先建立谈话事件，再把原待办转入跟进，
   *   避免「点了没反应」，也避免待办列表里留下语义重复的条目。
   */
  async function startTaskTalk(task: TaskRecord) {
    if (task.eventId) {
      setTalkEventId(task.eventId);
      return;
    }
    if (!task.studentId) {
      setNotice("这条待办没有关联学生，无法发起谈话。");
      return;
    }
    const next = await commit(async () => {
      const afterEvent = await registerEvent(store.current!, {
        studentId: task.studentId!,
        type: "待谈话",
        occurredAt: isoDay(),
        sourceType: "teacher",
        sourceText: `由待办发起：${task.title}`,
        facts: task.title,
        priority: task.priority,
        needsConversation: true,
        needsFollowUp: false,
      });
      await completeTask(store.current!, task.id, "已转入谈话事项跟进。");
      return afterEvent;
    }, "已由待办建立谈话事项，填写谈话记录后会自动生成后续复查待办。");
    if (next) setTalkEventId(next.events[0]?.id);
  }
  /** 导出完整本地备份：桌面端写入「下载」目录，浏览器端走 Blob 下载。返回是否成功。 */
  async function exportLocalBackup() {
    try {
      const path = await saveExportFile(
        `班主任AI工作台-本地备份-${isoDay()}.json`,
        JSON.stringify(space, null, 2),
        "application/json;charset=utf-8",
      );
      setNotice(
        path
          ? `已导出完整本地备份到下载文件夹：${path.split(/[\\/]/).pop()}。文件可能含学生资料，请妥善保管。`
          : "已导出完整本地备份。文件可能含学生资料，请妥善保管。",
      );
      return true;
    } catch (e) {
      setError(`备份导出失败：${(e as Error).message}`);
      return false;
    }
  }
  /** 打开「清除全部数据」流程。演示 / 会话模式数据只在内存里，不提供此入口。 */
  function openResetDialog() {
    setResetBackupDone(false);
    setResetBackupBusy(false);
    setResetSkipCount(0);
    setResetBusy(false);
    setResetOpen(true);
  }
  /** 第一步：强制导出文件备份；成功后「永久清除」才解锁。 */
  async function backupThenArmReset() {
    setResetBackupBusy(true);
    const ok = await exportLocalBackup();
    setResetBackupBusy(false);
    if (ok) setResetBackupDone(true);
  }
  /**
   * 最终清除。即便用户走「无需备份」逃生口，也先把当前空间快照写进本地
   * 数据库的 backups 库（应用内最后防线），再恢复出厂。
   */
  async function performReset() {
    const local = store.current;
    if (!local) return;
    setResetBusy(true);
    try {
      if (local instanceof V2IndexedStore)
        await local.snapshotBackup(`清除前自动快照 · ${isoDay()}`);
      await commit(
        () => resetV2Space(local),
        "已恢复出厂状态：全部业务数据已清除，默认谈话模板已还原。",
      );
      setResetOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResetBusy(false);
    }
  }
  /** 导出若干条谈话记录为 Markdown：纯本地写文件，不上传、不联网。 */
  async function exportTalkRecords(
    items: ConversationRecord[],
    fileBase: string,
  ) {
    try {
      const { count, path } = await exportConversations(items, space, {
        title: `${fileBase} · 谈心谈话记录`,
        fileBase: `${fileBase}-谈话记录`,
        day: isoDay(),
      });
      setNotice(
        count
          ? path
            ? `已导出 ${count} 条谈话记录到下载文件夹：${path.split(/[\\/]/).pop()}。文件含学生资料，请妥善保管。`
            : `已导出 ${count} 条谈话记录。文件含学生资料，请妥善保管。`
          : "当前没有可导出的谈话记录。",
      );
    } catch (e) {
      setError(`谈话记录导出失败：${(e as Error).message}`);
    }
  }
  /**
   * 打开某条谈话记录的 AI 润色弹窗 —— 谈心谈话唯一的 AI 入口。
   *
   * 口述记录往往口语化、表述不全，所以路径只有一条：
   * 本机去标识化 → 老师一键润色 → 本机恢复真实姓名 → 贴回这条记录。
   */
  function polishConversation(item: ConversationRecord) {
    setPolishRequest({
      title: "AI 润色谈话记录",
      subtitle: `${studentName(space, item.studentId)} · ${item.scenario} · ${item.happenedAt}`,
      sourceText: buildConversationTalkSource(space, item),
      scenario: item.scenario,
      templateId: item.templateId,
      studentId: item.studentId,
      conversationId: item.id,
      materialType: "conversation",
      sourceConversationIds: [item.id],
    });
  }

  return (
    <div className="v2-shell">
      <aside className="v2-sidebar">
        <a className="brand" href="/workbench">
          <img src="/icon.svg" alt="" />
          <span>
            班主任<span className="brand-sub">AI 工作台</span>
          </span>
        </a>
        <p className="v2-slogan">班里大小事，一个工作台。</p>
        <nav aria-label="主导航">
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "v2-nav active" : "v2-nav"}
              onClick={() => {
                setSelectedStudentId(undefined);
                setModuleStudentId(undefined);
                setPage(item.id);
              }}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.id === "tasks" &&
                space.tasks.some((task) => task.status === "待处理") && (
                  <b>
                    {
                      space.tasks.filter((task) => task.status === "待处理")
                        .length
                    }
                  </b>
                )}
            </button>
          ))}
        </nav>
        {/* 学工系统是正式审批与留痕的地方，这里只做「一键过去」的入口。 */}
        <div className="v2-external">
          {systemLinkEditing ? (
            <form
              className="v2-external-form"
              onSubmit={(event) => {
                event.preventDefault();
                commitStudentSystemUrl();
              }}
            >
              <label>
                学工系统网址
                <input
                  autoFocus
                  value={systemLinkDraft}
                  placeholder="https://xg.example.edu.cn"
                  aria-label="学工系统网址"
                  onChange={(event) => {
                    setSystemLinkDraft(event.target.value);
                    setSystemLinkError("");
                  }}
                />
              </label>
              {systemLinkError && (
                <p className="v2-external-error" role="alert">
                  {systemLinkError}
                </p>
              )}
              <div className="v2-external-actions">
                <button className="primary" type="submit">
                  保存
                </button>
                {!!studentSystemUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      saveStudentSystemUrl("");
                      setSystemLinkEditing(false);
                      setSystemLinkError("");
                    }}
                  >
                    清除
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSystemLinkEditing(false);
                    setSystemLinkError("");
                  }}
                >
                  取消
                </button>
              </div>
            </form>
          ) : studentSystemUrl ? (
            <div className="v2-external-ready">
              <a
                className="v2-external-link"
                title={studentSystemUrl}
                {...externalLinkProps(studentSystemUrl)}
              >
                <span aria-hidden="true">↗</span> 学工系统
              </a>
              <span className="v2-external-host">
                {shortStudentSystemUrl(studentSystemUrl)}
              </span>
              <button
                className="link-button"
                onClick={() => {
                  setSystemLinkDraft(studentSystemUrl);
                  setSystemLinkEditing(true);
                }}
              >
                修改链接
              </button>
            </div>
          ) : (
            <button
              className="v2-external-setup"
              onClick={() => {
                setSystemLinkDraft("");
                setSystemLinkError("");
                setSystemLinkEditing(true);
              }}
            >
              ＋ 设置学工系统链接
            </button>
          )}
        </div>
        <div className="v2-sidebar-foot">
          <span className="local-dot">
            ●{" "}
            {demo
              ? "100 人虚构演示空间"
              : session
                ? "仅本次会话"
                : "本机数据空间"}
          </span>
          <p>
            {demo || session
              ? "演示 / 会话数据仅存于内存，刷新或关闭页面即全部清除，不会写入本机数据库。"
              : "完整资料仅在本地查看；点击 AI 功能时才进入隐私网关。"}
          </p>
          <button className="link-button" onClick={exportLocalBackup}>
            导出完整本地备份
          </button>
          {!demo && !session && (
            <button className="link-button danger-link" onClick={openResetDialog}>
              清除全部数据…
            </button>
          )}
        </div>
      </aside>
      <section className="v2-workspace">
        <header className="v2-topbar">
          <div>
            <b>
              {selectedStudent
                ? `${selectedStudent.name} · 学生工作台`
                : nav.find((item) => item.id === page)?.label}
            </b>
            <span>
              {space.classes.length} 个班级 · {space.students.length} 名学生 ·
              数据保存在本机
            </span>
          </div>
          <div className="v2-top-actions">
            <button onClick={() => openNewEvent()}>＋ 登记一件事</button>
            <a
              className="button"
              href={demo ? "/workbench" : "/workbench?mode=demo"}
            >
              {demo ? "退出演示" : "打开 100 人演示"}
            </a>
          </div>
        </header>
        <main className="v2-main">
          {!ready && !error && <p className="notice">正在打开本地工作空间…</p>}
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {ready && page === "home" && (
            <Dashboard
              space={space}
              onNavigate={setPage}
              onNewEvent={() => openNewEvent()}
              onNewTalk={() => openTalkComposer()}
              onStudent={openStudent}
              onKpi={openKpi}
              onCompleteTask={async (task) => {
                await commit(
                  () => completeTask(store.current!, task.id),
                  `已完成「${task.title}」。`,
                );
              }}
            />
          )}
          {ready && page === "class" && !selectedStudent && (
            <ClassLibrary
              space={space}
              demo={demo}
              academicFocus={classFocus}
              onImport={async (students) => {
                await commit(
                  () => importV1Students(store.current!, students),
                  "花名册已升级为可浏览的班级与学生库。",
                );
              }}
              onError={setError}
              onStudent={openStudent}
            />
          )}
          {ready && page === "class" && selectedStudent && (
            <StudentWorkspace
              space={space}
              student={selectedStudent}
              onBack={() => setSelectedStudentId(undefined)}
              onNewEvent={() => openNewEvent(selectedStudent.id)}
              onTalk={(eventId) => setTalkEventId(eventId)}
              onStartTalk={() => openTalkComposer(selectedStudent)}
              onGateway={() =>
                setGatewayRequest({
                  studentId: selectedStudent.id,
                  title: "AI 帮我成文",
                  purpose: "talk",
                })
              }
              onAcademicGateway={() =>
                setGatewayRequest({
                  studentId: selectedStudent.id,
                  title: "AI 帮我生成谈话提纲",
                  purpose: "talk",
                  sourceText: buildAcademicTalkSource(space, selectedStudent),
                })
              }
              onUpdateCare={async (specialCare, careTypes) => {
                await commit(
                  () => updateStudentCare(store.current!, selectedStudent.id, specialCare, careTypes),
                  "特殊关爱状态已在本机更新。",
                );
              }}
              onCareer={() => {
                setModuleStudentId(selectedStudent.id);
                setSelectedStudentId(undefined);
                setPage("career");
              }}
              onMaterials={() => {
                // 学生详情的「生成材料」进入材料输出页，并带入该生。
                setModuleStudentId(selectedStudent.id);
                setSelectedStudentId(undefined);
                setPage("materials");
              }}
              onExportTalks={(items) =>
                exportTalkRecords(items, selectedStudent.name)
              }
              onPolishTalk={polishConversation}
            />
          )}
          {ready && page === "care" && (
            <SpecialCarePane
              space={space}
              onStudent={openStudent}
              onTalk={async (student) =>
                openTalkComposer(student, "特殊关爱跟进")
              }
              onTask={async (student) => {
                await commit(
                  () => addTaskRecord(store.current!, {
                    studentId: student.id,
                    type: "待回访",
                    title: `跟进${student.careTypes?.join("、") || "特殊关爱"}情况`,
                    dueAt: dayAfter(7),
                    priority: "medium",
                  }),
                  "特殊关爱跟进待办已创建。",
                );
              }}
              onEvent={openNewEvent}
            />
          )}
          {ready && page === "events" && (
            <EventCenter
              space={space}
              onNew={() => openNewEvent()}
              onStudent={openStudent}
              onTalk={setTalkEventId}
              onClose={async (eventId) => {
                await commit(
                  () =>
                    closeEvent(
                      store.current!,
                      eventId,
                      "已完成谈话与后续复查。",
                    ),
                  "事件已结案并保留本地过程记录。",
                );
              }}
            />
          )}
          {ready && page === "tasks" && (
            <TaskCenter
              space={space}
              focus={taskFocus}
              onStudent={openStudent}
              onEvent={() => setPage("events")}
              onAdd={async (task) => {
                await commit(
                  () => addTaskRecord(store.current!, task),
                  "待办已保存在本机。",
                );
              }}
              onTalk={(task) => void startTaskTalk(task)}
              onComplete={async (task) => {
                await commit(
                  () => completeTask(store.current!, task.id),
                  "待办已完成；关联事件状态已同步。",
                );
              }}
            />
          )}
          {ready && page === "talks" && (
            <ConversationCenter
              space={space}
              onStudent={openStudent}
              onNew={() => openTalkComposer()}
              onExport={(items) =>
                exportTalkRecords(
                  items,
                  items.length === 1
                    ? studentName(space, items[0].studentId)
                    : "全班",
                )
              }
              onPolish={polishConversation}
              onTemplates={async (templates) => {
                await commit(
                  () => replaceConversationTemplates(store.current!, templates),
                  "个人谈话模板设置已保存在本机。",
                );
              }}
            />
          )}
          {ready && page === "awards" && (
            <AwardsPane
              space={space}
              onCreateProject={async (project) => {
                await commit(
                  () => createAwardProject(store.current!, project),
                  "评奖评优项目已保存在本机。",
                );
              }}
              onAddCandidate={async (projectId, studentId, eligible) => {
                await commit(
                  () =>
                    addAwardCandidate(
                      store.current!,
                      projectId,
                      studentId,
                      eligible,
                    ),
                  "候选学生已加入，材料状态已建立。",
                );
              }}
              onUpdate={async (id, patch) => {
                await commit(
                  () => updateAwardApplication(store.current!, id, patch),
                  "候选状态已更新。",
                );
              }}
              onBulk={async (ids, status) => {
                await commit(
                  () => bulkUpdateAwardStatus(store.current!, ids, status),
                  `已批量更新 ${ids.length} 条记录为“${status}”。`,
                );
              }}
              onStudent={openStudent}
              onGateway={(request) => setGatewayRequest(request)}
            />
          )}
          {ready && page === "career" && (
            <CareerPane
              space={space}
              focusStudentId={moduleStudentId}
              initialFilter={careerFocus as Parameters<typeof careerFilter>[1]}
              onSave={async (plan) => {
                await commit(
                  () => upsertCareerPlan(store.current!, plan),
                  "升学就业档案已保存在本机。",
                );
              }}
              onStudent={openStudent}
              onStartTalk={async (student, type) => {
                const next = await commit(
                  () =>
                    registerEvent(store.current!, {
                      studentId: student.id,
                      type,
                      occurredAt: isoDay(),
                      sourceType: "self",
                      sourceText: "由升学就业档案发起",
                      facts: `需要与学生核实并推进${type}计划。`,
                      priority: "medium",
                      needsConversation: true,
                      needsFollowUp: true,
                    }),
                  `已建立${type}谈话事项。`,
                );
                if (next) setTalkEventId(next.events[0]?.id);
              }}
              onTask={async (studentId, type, title, dueAt) => {
                await commit(
                  () =>
                    addTaskRecord(store.current!, {
                      studentId,
                      type,
                      title,
                      dueAt,
                      priority: "medium",
                    }),
                  "跟进待办已创建，首页会同步显示。",
                );
              }}
              onGateway={(request) => setGatewayRequest(request)}
            />
          )}
          {ready && page === "materials" && (
            <MaterialsPane
              key={moduleStudentId ?? "materials"}
              space={space}
              initialStudentId={moduleStudentId}
              onArchive={async (draft) => {
                await commit(
                  () => saveMaterialArchive(store.current!, draft),
                  "材料已保存在本地归档。",
                );
              }}
              onPolish={(preview) => {
                const materialType = preview.type as MaterialType;
                setPolishRequest({
                  title: `AI 润色 · ${materialTypeLabels[materialType]}`,
                  subtitle: preview.title,
                  sourceText: preview.content,
                  studentId: preview.studentId,
                  materialType,
                  sourceEventIds: preview.sourceEventIds,
                  sourceConversationIds: preview.sourceConversationIds,
                });
              }}
            />
          )}
          {ready && page === "settings" && <AiSettingsPane />}
        </main>
      </section>
      {eventFormOpen && (
        <EventForm
          students={space.students}
          initialStudentId={selectedStudentId}
          onCancel={() => setEventFormOpen(false)}
          onSubmit={async (data) => {
            const next = await commit(
              () => registerEvent(store.current!, data),
              "事件已登记，关联待办已自动生成。",
            );
            if (next) {
              setEventFormOpen(false);
              setPage("events");
            }
          }}
        />
      )}
      {resetOpen && (
        <Modal title="清除全部数据" onCancel={() => !resetBusy && setResetOpen(false)}>
          <div className="reset-warning" role="alert">
            <b>此操作不可恢复。</b>
            将清除本机数据空间中的全部内容：花名册与学生档案、事件、待办、谈心谈话、
            材料归档、评奖评优与升学就业数据，并还原默认谈话模板。
          </div>
          <ol className="reset-steps">
            <li>
              <b>第一步 · 强制备份</b>
              <p>
                先把完整备份文件导出到「下载」目录（含全部学生资料，请妥善保管）。
                备份成功后才能进行下一步。
              </p>
              <button
                disabled={resetBackupBusy || resetBackupDone}
                onClick={backupThenArmReset}
              >
                {resetBackupBusy
                  ? "正在导出备份…"
                  : resetBackupDone
                    ? "✓ 备份文件已导出"
                    : "导出完整备份，解锁下一步"}
              </button>
            </li>
            <li>
              <b>第二步 · 永久清除</b>
              <p>
                清除时应用还会在本机数据库里自动留存一份「清除前快照」作为最后防线。
              </p>
              <button
                className="danger-button"
                disabled={!resetBackupDone || resetBusy}
                onClick={performReset}
              >
                {resetBusy ? "正在清除…" : "永久清除全部数据"}
              </button>
            </li>
          </ol>
          <p className="reset-skip">
            确实不需要备份文件？
            <button
              className="link-button"
              disabled={resetBusy}
              onClick={() => setResetSkipCount((n) => n + 1)}
            >
              {resetSkipCount === 0
                ? "无需备份，直接清除（需连点 3 次）"
                : resetSkipCount < 3
                  ? `已点 ${resetSkipCount} 次，再点 ${3 - resetSkipCount} 次确认`
                  : "已确认无需备份"}
            </button>
            {resetSkipCount >= 3 && (
              <button
                className="danger-button"
                disabled={resetBusy}
                onClick={performReset}
              >
                {resetBusy ? "正在清除…" : "永久清除（跳过文件备份，仍保留数据库快照）"}
              </button>
            )}
          </p>
        </Modal>
      )}
      {talkComposer && (
        <NewTalkForm
          key={talkComposer.studentId ?? "any"}
          students={space.students}
          initialStudentId={talkComposer.studentId}
          initialTopic={talkComposer.topic}
          templates={space.conversationTemplates}
          onCancel={() => setTalkComposer(undefined)}
          onSubmit={async (data) => {
            const next = await commit(
              () => recordStandaloneConversation(store.current!, data),
              [
                "谈话记录已本地保存。",
                data.archiveEvent ? "已在「事务」留存一条记录。" : "",
                data.needsFollowUpTask ? "已按设置生成复查待办。" : "",
              ].join(""),
            );
            if (next) setTalkComposer(undefined);
          }}
        />
      )}
      {talkEventId && (
        <TalkForm
          event={space.events.find((event) => event.id === talkEventId)!}
          template={
            space.conversationTemplates.find(
              (template) => template.isDefault,
            ) ??
            space.conversationTemplates.find((template) =>
              template.name.includes(
                space.events.find((event) => event.id === talkEventId)?.type ??
                  "",
              ),
            ) ??
            space.conversationTemplates[0]
          }
          studentName={studentName(
            space,
            space.events.find((event) => event.id === talkEventId)?.studentId,
          )}
          onCancel={() => setTalkEventId(undefined)}
          onSubmit={async (input) => {
            const next = await commit(
              () => completeEventConversation(store.current!, input),
              "谈话记录已本地保存，并生成后续复查待办。",
            );
            if (next) {
              setTalkEventId(undefined);
              setPage("tasks");
            }
          }}
        />
      )}
      {gatewayRequest && (
        <PrivacyGateway
          space={space}
          student={space.students.find(
            (student) => student.id === gatewayRequest.studentId,
          )}
          title={gatewayRequest.title}
          purpose={gatewayRequest.purpose}
          sourceText={gatewayRequest.sourceText}
          scenario={gatewayRequest.scenario}
          templateId={gatewayRequest.templateId}
          onOpenSettings={() => {
            setGatewayRequest(undefined);
            setPage("settings");
          }}
          onCancel={() => setGatewayRequest(undefined)}
          onSave={async (result) => {
            let next: V2Space | undefined;
            if (gatewayRequest.purpose === "talk" && gatewayRequest.studentId)
              next = await commit(
                () =>
                  saveGatewayResult(
                    store.current!,
                    gatewayRequest.studentId!,
                    result,
                    gatewayRequest.conversationId,
                  ),
                "AI 返回已在本机恢复身份并经人工审核后保存。",
              );
            else if (
              gatewayRequest.purpose === "award" &&
              gatewayRequest.awardApplicationId
            )
              next = await commit(
                () =>
                  updateAwardApplication(
                    store.current!,
                    gatewayRequest.awardApplicationId!,
                    { result },
                  ),
                "推荐材料已恢复身份、人工审核并保存到候选记录。",
              );
            else
              next = await commit(
                () =>
                  saveMaterialArchive(store.current!, {
                    type: gatewayRequest.materialType ?? gatewayRequest.purpose,
                    title: gatewayRequest.title,
                    studentId: gatewayRequest.studentId,
                    sourceEventIds: gatewayRequest.sourceEventIds ?? [],
                    sourceConversationIds:
                      gatewayRequest.sourceConversationIds ?? [],
                    content: result,
                    aiUsed: true,
                  }),
                "AI 优化结果已恢复身份、人工审核并保存到本地归档。",
              );
            if (next) setGatewayRequest(undefined);
          }}
        />
      )}
      {polishRequest && (
        <AiPolishDialog
          space={space}
          title={polishRequest.title}
          subtitle={polishRequest.subtitle}
          sourceText={polishRequest.sourceText}
          scenario={polishRequest.scenario}
          templateId={polishRequest.templateId}
          onClose={() => setPolishRequest(undefined)}
          onOpenSettings={() => {
            setPolishRequest(undefined);
            setPage("settings");
          }}
          onApply={async (polished) => {
            const request = polishRequest;
            // 谈话记录：贴回那一条（本机恢复姓名后写回 finalRecord）。
            if (request.conversationId && request.studentId)
              await commit(
                () =>
                  saveGatewayResult(
                    store.current!,
                    request.studentId!,
                    polished,
                    request.conversationId,
                  ),
                "润色结果已贴回这条谈话记录。",
              );
            // 无论来自谈话还是材料，都同步留一份材料归档，便于「材料输出」直接复制。
            await commit(
              () =>
                saveMaterialArchive(store.current!, {
                  type: request.materialType ?? "conversation",
                  title: `${request.studentId ? studentName(space, request.studentId) : "未关联学生"}｜${
                    materialTypeLabels[request.materialType ?? "conversation"]
                  }`,
                  studentId: request.studentId,
                  sourceEventIds: request.sourceEventIds ?? [],
                  sourceConversationIds: request.sourceConversationIds ?? [],
                  content: polished,
                  aiUsed: true,
                }),
              "润色结果已归档到材料输出。",
            );
            setPolishRequest(undefined);
          }}
        />
      )}
    </div>
  );
}

function Dashboard({
  space,
  onNavigate,
  onNewEvent,
  onNewTalk,
  onStudent,
  onKpi,
  onCompleteTask,
}: {
  space: V2Space;
  onNavigate: (page: Page) => void;
  onNewEvent: () => void;
  onNewTalk: () => void;
  onStudent: (id: string) => void;
  onKpi: (target: KpiTarget) => void;
  onCompleteTask: (task: TaskRecord) => Promise<void>;
}) {
  const metrics = dashboardMetrics(space, isoDay());
  const pending = space.tasks
    .filter((task) => task.status === "待处理")
    .slice(0, 5);
  const cards: Array<[string, string | number, KpiTarget]> = [
    ["班级总人数", metrics.totalStudents, { page: "class" }],
    ["特殊关爱学生", metrics.specialCareCount, { page: "care" }],
    ["今日/本周缺勤", `${metrics.todayAbsence} / ${metrics.weekAbsence}`, { page: "events" }],
    ["待谈话", metrics.pendingConversation, { page: "tasks", taskType: "待谈话" }],
    ["待跟进", metrics.pendingFollowUp, { page: "tasks" }],
    ["学业异常", metrics.academicConcernCount, { page: "class", classFocus: "concern" }],
    ["挂科学生", metrics.failedStudentCount, { page: "class", classFocus: "failed" }],
    ["超期待办", metrics.overdueTasks, { page: "tasks", taskScope: "超期" }],
    ["专升本", metrics.furtherStudyCount, { page: "career", careerFilter: "upgrade" }],
    ["就业方向未明确", metrics.directionUnknownCount, { page: "career", careerFilter: "no-direction" }],
    ["评奖评优待处理", metrics.awardPendingCount, { page: "awards" }],
    ["奖助材料未齐", metrics.awardMissingCount, { page: "awards" }],
    ["就业长期未跟进", metrics.employmentStaleCount, { page: "career", careerFilter: "stale" }],
  ];
  const attendance = Array.from({ length: 7 }, (_, offset) => {
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - (6 - offset));
    const key = cursor.toISOString().slice(0, 10);
    return {
      date: key.slice(5),
      count: space.attendanceRecords.filter(
        (record) => record.date === key && record.type !== "present",
      ).length,
    };
  });
  const directions = careerDirectionCounts(space).map((item) => ({
    label: item.direction,
    count: item.count,
  }));
  const failedCounts = new Map<string, number>();
  for (const record of space.academicRecords)
    if (record.failed)
      failedCounts.set(
        record.studentId,
        (failedCounts.get(record.studentId) ?? 0) + 1,
      );
  const academicDistribution = [
    {
      label: "无挂科",
      count: space.students.filter((student) => !failedCounts.get(student.id))
        .length,
    },
    {
      label: "1 门挂科",
      count: space.students.filter(
        (student) => failedCounts.get(student.id) === 1,
      ).length,
    },
    {
      label: "2 门及以上",
      count: space.students.filter(
        (student) => (failedCounts.get(student.id) ?? 0) >= 2,
      ).length,
    },
  ];
  const eventTypes = [
    "考勤",
    "学业",
    "家庭",
    "宿舍/人际",
    "升学就业",
    "其他",
  ].map((label) => ({
    label,
    count: space.events.filter((event) =>
      label === "考勤"
        ? ["缺勤", "迟到", "请假异常"].includes(event.type)
        : label === "学业"
          ? ["挂科", "成绩下降", "学习困难"].includes(event.type)
          : label === "家庭"
            ? event.type === "家庭困难"
            : label === "宿舍/人际"
              ? ["宿舍问题", "人际矛盾"].includes(event.type)
              : label === "升学就业"
                ? ["就业", "专升本", "实习异常"].includes(event.type)
                : ![
                    "缺勤",
                    "迟到",
                    "请假异常",
                    "挂科",
                    "成绩下降",
                    "学习困难",
                    "家庭困难",
                    "宿舍问题",
                    "人际矛盾",
                    "就业",
                    "专升本",
                    "实习异常",
                  ].includes(event.type),
    ).length,
  }));
  return (
    <>
      <div className="v2-page-title">
        <div>
          <span>今日工作概览</span>
          <h1>班里现在什么状态？</h1>
          <p>数字来自本机数据聚合；提醒只描述事实和待处理事项。</p>
        </div>
        <button className="primary" onClick={onNewEvent}>
          ＋ 登记一件事
        </button>
      </div>
      {!space.students.length ? (
        <Empty>
          <h2>先建立你的班级</h2>
          <p>
            导入 CSV / XLSX 花名册后，学生会立即出现在学生库，而不只是脱敏字典。
          </p>
          <button className="primary" onClick={() => onNavigate("class")}>
            去导入花名册
          </button>
        </Empty>
      ) : (
        <>
          <TodayBoard
            space={space}
            onOpenTasks={() => onNavigate("tasks")}
            onOpenTalks={() => onNavigate("talks")}
            onStudent={onStudent}
            onComplete={onCompleteTask}
          />
          <section className="v2-kpis">
            {cards.map(([label, value, target]) => (
              <button
                className={label === "特殊关爱学生" ? "care-kpi" : ""}
                key={label}
                title="点击查看对应明细"
                onClick={() => onKpi(target)}
              >
                <span>{label}</span>
                <strong>{value}{label === "特殊关爱学生" ? " 人" : ""}</strong>
                <small aria-hidden="true">→</small>
              </button>
            ))}
          </section>
          <section className="v2-dashboard-grid">
            <article className="panel v2-chart">
              <div className="section-title">
                <div>
                  <h2>近 7 天考勤变化</h2>
                  <p>缺勤、迟到与请假记录合计</p>
                </div>
              </div>
              <div className="spark-bars">
                {attendance.map((item) => (
                  <div key={item.date}>
                    <i
                      style={{ height: `${Math.max(8, item.count * 18)}px` }}
                    />
                    <b>{item.count}</b>
                    <span>{item.date.slice(3)}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel v2-chart">
              <div className="section-title">
                <div>
                  <h2>升学就业方向</h2>
                  <p>本地档案中的当前意向</p>
                </div>
              </div>
              <div className="horizontal-bars">
                {directions.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <i>
                      <b
                        style={{
                          width: `${space.students.length ? (item.count / space.students.length) * 100 : 0}%`,
                        }}
                      />
                    </i>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel v2-chart">
              <div className="section-title">
                <div>
                  <h2>学业状态分布</h2>
                  <p>依据已导入的挂科记录</p>
                </div>
              </div>
              <div className="vertical-distribution">
                {academicDistribution.map((item) => (
                  <div key={item.label}>
                    <b>{item.count}</b>
                    <i
                      style={{
                        height: `${Math.max(7, (item.count / Math.max(1, space.students.length)) * 120)}px`,
                      }}
                    />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel v2-chart">
              <div className="section-title">
                <div>
                  <h2>学生事务类型构成</h2>
                  <p>每一项可追溯到事实记录</p>
                </div>
              </div>
              <div className="event-composition">
                {eventTypes.map((item, index) => (
                  <div
                    key={item.label}
                    style={{ opacity: 0.62 + index * 0.06 }}
                  >
                    <b>{item.count}</b>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel v2-todos">
              <div className="section-title">
                <div>
                  <h2>今天先做什么</h2>
                  <p>按待办状态与截止时间排列</p>
                </div>
                <button onClick={() => onNavigate("tasks")}>全部待办</button>
              </div>
              {pending.length ? (
                pending.map((task) => (
                  <button
                    className="todo-row"
                    key={task.id}
                    onClick={() => task.studentId && onStudent(task.studentId)}
                  >
                    <span className={`priority ${task.priority}`}>
                      {task.priority === "high" ? "急" : "待"}
                    </span>
                    <span>
                      <b>
                        {studentName(space, task.studentId)} · {task.title}
                      </b>
                      <small>
                        {task.dueAt ? `截止 ${task.dueAt}` : "未设置截止时间"} ·
                        可追溯到原始事件
                      </small>
                    </span>
                    <em>→</em>
                  </button>
                ))
              ) : (
                <Empty>当前没有待办。新事件可自动生成谈话或复查任务。</Empty>
              )}
            </article>
            <article className="panel v2-quick">
              <h2>快速开始</h2>
              {[
                ["登记一件事", onNewEvent],
                ["发起谈心谈话", onNewTalk],
                ["查看学生库", () => onNavigate("class")],
                ["处理待办", () => onNavigate("tasks")],
                ["输出材料", () => onNavigate("materials")],
              ].map(([label, action]) => (
                <button key={label as string} onClick={action as () => void}>
                  {label as string}
                  <span>→</span>
                </button>
              ))}
            </article>
            <article className="panel dashboard-class-table">
              <div className="section-title">
                <div>
                  <h2>班级多维表</h2>
                  <p>先看状态与依据，再进入学生工作台</p>
                </div>
                <button onClick={() => onNavigate("class")}>
                  打开全部学生
                </button>
              </div>
              <div className="table-scroll">
                <table className="v2-table">
                  <thead>
                    <tr>
                      <th>学生</th>
                      <th>状态</th>
                      <th>班委</th>
                      <th>缺勤</th>
                      <th>挂科</th>
                      <th>待谈话</th>
                      <th>毕业方向</th>
                      <th>待办</th>
                    </tr>
                  </thead>
                  <tbody>
                    {space.students.slice(0, 8).map((student) => (
                      <tr
                        key={student.id}
                        onClick={() => onStudent(student.id)}
                      >
                        <td>
                          <b>{student.name}</b>
                          <small>{student.studentNo}</small>
                        </td>
                        <td>
                          <span className={`status status-${student.status}`}>
                            {student.status}
                          </span>
                        </td>
                        <td>{student.currentRole ?? "—"}</td>
                        <td>
                          {
                            space.attendanceRecords.filter(
                              (item) =>
                                item.studentId === student.id &&
                                item.type === "absent",
                            ).length
                          }
                        </td>
                        <td>{failedCounts.get(student.id) ?? 0}</td>
                        <td>
                          {
                            space.tasks.filter(
                              (item) =>
                                item.studentId === student.id &&
                                item.type === "待谈话" &&
                                item.status === "待处理",
                            ).length
                          }
                        </td>
                        <td>{student.graduationDirection ?? "未明确"}</td>
                        <td>{studentTaskCount(space.tasks, student.id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
}

function ClassLibrary({
  space,
  demo,
  academicFocus,
  onImport,
  onError,
  onStudent,
}: {
  space: V2Space;
  demo: boolean;
  /** 首页 KPI 卡片带来的学业筛选聚焦；空串表示「全部」。 */
  academicFocus?: "failed" | "concern" | "";
  onImport: (students: V1Student[]) => Promise<void>;
  onError: (message: string) => void;
  onStudent: (id: string) => void;
}) {
  const [classId, setClassId] = useState(space.classes[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [academic, setAcademic] = useState(academicFocus ?? "");
  const [sort, setSort] = useState<"studentNo" | "name">("studentNo");
  useEffect(() => {
    if (!classId && space.classes[0]) setClassId(space.classes[0].id);
  }, [classId, space.classes]);
  useEffect(() => {
    setAcademic(academicFocus ?? "");
  }, [academicFocus]);
  const failedIds = useMemo(
    () =>
      new Set(
        space.academicRecords
          .filter((record) => record.failed || (record.failedCount ?? 0) > 0)
          .map((record) => record.studentId),
      ),
    [space.academicRecords],
  );
  const academicConcernIds = useMemo(
    // 与 selectors.dashboardMetrics 的 academicConcernCount 同口径：
    // 挂科（含多门）或最近一次成绩明显下滑。
    () =>
      new Set(
        space.students
          .filter((student) => {
            const records = space.academicRecords.filter(
              (record) => record.studentId === student.id,
            );
            const previous = records.find((record) => record.term === "上次");
            const latest = records.find((record) => record.term === "最近");
            return (
              records.some(
                (record) => record.failed || (record.failedCount ?? 0) > 0,
              ) ||
              (previous?.score !== undefined &&
                latest?.score !== undefined &&
                latest.score < previous.score)
            );
          })
          .map((student) => student.id),
      ),
    [space.students, space.academicRecords],
  );
  const students = useMemo(
    () =>
      filterStudents(space.students, { classId, query, status, tag })
        .filter((student) =>
          academic === "failed"
            ? failedIds.has(student.id)
            : academic === "concern"
              ? academicConcernIds.has(student.id)
              : true,
        )
        .sort((a, b) => a[sort].localeCompare(b[sort], "zh-CN")),
    [
      space.students,
      classId,
      query,
      status,
      tag,
      academic,
      failedIds,
      academicConcernIds,
      sort,
    ],
  );
  const tags = [...new Set(space.students.flatMap((student) => student.tags))];
  const rosterStudents: V1Student[] = space.students.map((student) => ({
    id: student.id,
    name: student.name,
    studentId: student.studentNo,
    className:
      space.classes.find((item) => item.id === student.classId)?.name ??
      "未分班",
    phone: student.phone,
    email: student.email,
    dorm: student.dorm,
    address: student.address,
  }));
  return (
    <>
      <div className="v2-page-title">
        <div>
          <span>我的班级 / 学生库</span>
          <h1>完整资料在本地直接可见</h1>
          <p>以学号建立稳定身份；导入后立即形成班级与学生档案。</p>
        </div>
      </div>
      <RosterPane
        students={rosterStudents}
        onImport={onImport}
        disabled={demo}
        disabledMessage="演示模式使用 100 名虚构学生，禁止导入或读取真实花名册。"
        onError={onError}
      />
      {space.classes.map((klass) => {
        const classStudents = space.students.filter((student) => student.classId === klass.id);
        return <p className="import-summary" key={klass.id}>
          {klass.name} · {classStudents.length}人 · 特殊关爱{classStudents.filter((student) => student.specialCare).length}人
        </p>;
      })}
      {!!space.students.length && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>学生总表</h2>
              <p>
                当前显示 {students.length} / {space.students.length} 名学生
              </p>
            </div>
          </div>
          <div className="v2-filters">
            <label>
              班级
              <select
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
              >
                {space.classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}（
                    {
                      space.students.filter(
                        (student) => student.classId === item.id,
                      ).length
                    }
                    ）
                  </option>
                ))}
              </select>
            </label>
            <label>
              搜索
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="姓名 / 学号 / 手机号"
              />
            </label>
            <label>
              工作状态
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">全部状态</option>
                {[
                  "正常",
                  "待关注",
                  "待谈话",
                  "跟进中",
                  "实习中",
                  "毕业去向待确认",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              学业状态
              <select
                value={academic}
                onChange={(event) =>
                  setAcademic(event.target.value as typeof academic)
                }
              >
                <option value="">全部学生</option>
                <option value="failed">挂科学生</option>
                <option value="concern">学业异常</option>
              </select>
            </label>
            <label>
              标签
              <select
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              >
                <option value="">全部标签</option>
                {tags.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              排序
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                <option value="studentNo">按学号</option>
                <option value="name">按姓名</option>
              </select>
            </label>
          </div>
          <div className="table-scroll">
            <table className="v2-table">
              <thead>
                <tr>
                  <th>学号</th>
                  <th>姓名</th>
                  <th>工作状态</th>
                  <th>班委</th>
                  <th>标签</th>
                  <th>毕业方向</th>
                  <th>待办</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr
                    key={student.id}
                    className="row-clickable"
                    onClick={() => onStudent(student.id)}
                  >
                    <td>{student.studentNo}</td>
                    <td>
                      <b>{student.name}</b>
                    </td>
                    <td>
                      <span className={`status status-${student.status}`}>
                        {student.status}
                      </span>
                    </td>
                    <td>{student.currentRole ?? "—"}</td>
                    <td>{student.tags.join("、") || "—"}</td>
                    <td>{student.graduationDirection ?? "未明确"}</td>
                    <td>{studentTaskCount(space.tasks, student.id)}</td>
                    <td>
                      <button
                        className="row-open"
                        onClick={(event) => {
                          event.stopPropagation();
                          onStudent(student.id);
                        }}
                      >
                        打开工作台 →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function TrendLine({
  label,
  points,
  lowerIsBetter = false,
}: {
  label: string;
  points: Array<{ label: string; value: number }>;
  lowerIsBetter?: boolean;
}) {
  const transformed = points.map((point) => lowerIsBetter ? -point.value : point.value);
  const min = Math.min(...transformed);
  const max = Math.max(...transformed);
  const coords = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? 150 : 24 + index * (252 / (points.length - 1)),
    y: 76 - ((transformed[index] - min) / Math.max(1, max - min)) * 52,
  }));
  return <div className="line-chart" aria-label={label}>
    <svg viewBox="0 0 300 105" role="img">
      <line x1="20" y1="78" x2="282" y2="78" />
      <polyline points={coords.map((point) => `${point.x},${point.y}`).join(" ")} />
      {coords.map((point) => <g key={`${point.label}-${point.value}`}><circle cx={point.x} cy={point.y} r="4" /><text x={point.x} y={point.y - 9}>{point.value}</text><text className="axis-label" x={point.x} y="98">{point.label}</text></g>)}
    </svg>
  </div>;
}

const careTypeOptions = ["家庭经济 / 家庭变故", "心理状态关注", "学业困难", "升学就业长期无进展", "其他"];
function CareEditor({ student, onSave }: { student: StudentRecord; onSave: (specialCare: boolean, careTypes: string[]) => Promise<void> }) {
  const [enabled, setEnabled] = useState(!!student.specialCare);
  const [types, setTypes] = useState(student.careTypes ?? []);
  return <details className="care-editor">
    <summary>本地编辑特殊关爱状态</summary>
    <label className="check"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />设为特殊关爱学生</label>
    <div className="material-checks">
      {careTypeOptions.map((item) => <label className="check" key={item}><input type="checkbox" disabled={!enabled} checked={types.includes(item)} onChange={(event) => setTypes(event.target.checked ? [...types, item] : types.filter((value) => value !== item))} />{item}</label>)}
    </div>
    <button onClick={() => void onSave(enabled, types)}>保存本地状态</button>
  </details>;
}

function StudentWorkspace({
  space,
  student,
  onBack,
  onNewEvent,
  onTalk,
  onStartTalk,
  onGateway,
  onAcademicGateway,
  onUpdateCare,
  onCareer,
  onMaterials,
  onExportTalks,
  onPolishTalk,
}: {
  space: V2Space;
  student: StudentRecord;
  onBack: () => void;
  onNewEvent: () => void;
  onTalk: (eventId: string) => void;
  onStartTalk: () => void;
  onGateway: () => void;
  onAcademicGateway: () => void;
  onUpdateCare: (specialCare: boolean, careTypes: string[]) => Promise<void>;
  onCareer: () => void;
  onMaterials: () => void;
  onExportTalks: (items: ConversationRecord[]) => void;
  /** 打开这条谈话记录的 AI 润色弹窗。 */
  onPolishTalk: (item: ConversationRecord) => void;
}) {
  const events = eventsForStudent(space.events, student.id);
  const tasks = space.tasks.filter(
    (task) => task.studentId === student.id && task.status === "待处理",
  );
  const conversations = space.conversations.filter(
    (item) => item.studentId === student.id,
  );
  const talkRecords = sortConversations(conversations);
  const sensitive = space.sensitiveProfiles.find(
    (item) => item.studentId === student.id,
  );
  const academic = space.academicRecords.filter(
    (item) => item.studentId === student.id,
  );
  const attendance = space.attendanceRecords.filter(
    (item) => item.studentId === student.id,
  );
  const scores = academic
    .filter((item) => typeof item.score === "number")
    .slice(-6);
  const rankings = academic
    .filter((item) => typeof item.rank === "number")
    .slice(-6);
  const latestAcademicRecord = latestAcademic(space, student.id);
  const failedCount = latestAcademicRecord?.failedCount ?? academic.filter((item) => item.failed).length;
  const weekStart = (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    const offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    return date.toISOString().slice(0, 10);
  };
  const attendanceTrend = [...new Set(attendance.map((item) => weekStart(item.date)))]
    .sort().slice(-6).map((week) => ({
      week,
      absent: attendance.filter((item) => weekStart(item.date) === week && item.type === "absent").length,
      late: attendance.filter((item) => weekStart(item.date) === week && item.type === "late").length,
      leave: attendance.filter((item) => weekStart(item.date) === week && item.type === "leave").length,
    }));
  const roles = space.roleHistory.filter(
    (item) => item.studentId === student.id,
  );
  const awards = space.awardApplications.filter(
    (item) => item.studentId === student.id,
  );
  const career = space.careerPlans.find(
    (item) => item.studentId === student.id,
  );
  const rankDelta = rankings.length >= 2
    ? rankings[0].rank! - rankings.at(-1)!.rank!
    : undefined;
  const rankChangeText = rankDelta === undefined
    ? student.importedRankChange || "暂无对比"
    : rankDelta > 0
      ? `↑ 上升 ${rankDelta} 名`
      : rankDelta < 0
        ? `↓ 下降 ${Math.abs(rankDelta)} 名`
        : "— 无明显变化";
  const timelineItems = [
    ...events.map((item) => ({ id: item.id, date: item.occurredAt, title: `${item.type} · ${item.status}`, text: item.facts })),
    ...conversations.map((item) => ({ id: item.id, date: item.happenedAt, title: `谈心谈话 · ${item.scenario}`, text: item.studentExpression || item.rawNotes })),
    ...(!conversations.length && student.importedLastTalkDate
      ? [{ id: `imported-talk:${student.id}`, date: student.importedLastTalkDate, title: "最近谈话日期（花名册导入）", text: "仅导入了日期，谈话详情尚未录入本工作台。" }]
      : []),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <button className="back-button" onClick={onBack}>
        ← 返回学生列表
      </button>
      <section className="panel student-hero">
        <div>
          <span className={`status status-${student.status}`}>
            {student.status}
          </span>
          <h1>{student.name}</h1>
          <p>
            {student.studentNo} ·{" "}
            {space.classes.find((item) => item.id === student.classId)?.name}
          </p>
          <div className="tag-row">
            <span className={student.specialCare ? "care-tag" : ""}>
              特殊关爱：{student.specialCare ? "是" : "否"}
            </span>
            {student.careTypes?.map((type) => <span className="care-tag" key={type}>{type}</span>)}
            {student.currentRole && <span>{student.currentRole}</span>}
            {student.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        <div className="student-summary">
          <strong>
            {tasks.length + (student.importedTaskCount ?? 0)}
            <small>当前待办</small>
          </strong>
          <strong>
            {events.length}
            <small>历史事件</small>
          </strong>
          <strong>
            {conversations.length}
            <small>谈话记录</small>
          </strong>
        </div>
        <div className="button-row">
          <button className="primary" onClick={onNewEvent}>
            登记事件
          </button>
          <button onClick={onStartTalk}>发起谈话</button>
          {events.find(
            (item) =>
              item.needsConversation && !item.relatedConversationIds.length,
          ) && (
            <button
              onClick={() =>
                onTalk(
                  events.find(
                    (item) =>
                      item.needsConversation &&
                      !item.relatedConversationIds.length,
                  )!.id,
                )
              }
            >
              完成谈话
            </button>
          )}
          <button
            onClick={onGateway}
            disabled={!conversations.length}
            title={
              conversations.length
                ? "进入 AI Privacy Gateway"
                : "请先完成一次谈话"
            }
          >
            AI 帮我成文
          </button>
          <button onClick={onAcademicGateway}>AI 帮我生成谈话提纲</button>
          <button onClick={onCareer}>升学就业档案</button>
          <button onClick={onMaterials}>输出已有材料</button>
        </div>
      </section>
      <section className="student-grid">
        {/* 谈话记录独立成块：原来只在时间线里混一句摘要，老师找不到。 */}
        <article className="panel talk-records full-span">
          <div className="section-title">
            <div>
              <h2>谈话记录</h2>
              <p>
                {talkRecords.length
                  ? `共 ${talkRecords.length} 条 · 按谈话日期倒序。内容为本地完整资料，不含 AI 处理。`
                  : "还没有谈话记录。"}
              </p>
            </div>
            {talkRecords.length > 0 && (
              <div className="button-row">
                <button
                  onClick={() =>
                    onExportTalks(talkRecords)
                  }
                >
                  导出该生全部（Markdown）
                </button>
              </div>
            )}
          </div>
          {!talkRecords.length ? (
            <Empty>
              <h2>暂无谈话记录</h2>
              <p>
                点上方「发起谈话」直接记录，谈完即归档，不会额外生成待办。
              </p>
            </Empty>
          ) : (
            <div className="talk-record-list">
              {talkRecords.map((item) => (
                <article className="talk-record" key={item.id}>
                  <header className="talk-record-head">
                    <b>{item.scenario || "未填写主题"}</b>
                    <span>
                      {item.happenedAt}
                      {item.location?.trim() ? ` · ${item.location}` : ""}
                    </span>
                    <span className="badge">
                      {item.aiUsed ? "AI 辅助成文" : "本地模板成文"}
                    </span>
                  </header>
                  <ConversationFields item={item} />
                  <details>
                    <summary>查看标准记录</summary>
                    <pre>{item.finalRecord}</pre>
                  </details>
                  <div className="button-row">
                    <button onClick={() => onExportTalks([item])}>
                      导出此条
                    </button>
                    <button onClick={() => onPolishTalk(item)}>
                      AI 润色
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
        <article className="panel">
          <h2>基本信息</h2>
          <dl className="detail-list">
            <div>
              <dt>身份证号</dt>
              <dd>{sensitive?.identity || "未填写"}</dd>
            </div>
            <div>
              <dt>手机号</dt>
              <dd>{student.phone || "未填写"}</dd>
            </div>
            <div>
              <dt>邮箱</dt>
              <dd>{student.email || "未填写"}</dd>
            </div>
            <div>
              <dt>宿舍</dt>
              <dd>{student.dorm || "未填写"}</dd>
            </div>
            <div>
              <dt>家庭住址</dt>
              <dd>{student.address || "未填写"}</dd>
            </div>
            <div>
              <dt>当前班委</dt>
              <dd>{student.currentRole || "未担任"}</dd>
            </div>
            <div>
              <dt>曾任班委</dt>
              <dd>{student.formerRoles || "未记录"}</dd>
            </div>
            <div>
              <dt>毕业方向</dt>
              <dd>{student.graduationDirection || "未明确"}</dd>
            </div>
          </dl>
        </article>
        <article className="panel sensitive-panel">
          <span className="badge amber">仅本地敏感信息 · 完整可见</span>
          <h2>特殊关爱与重要情况</h2>
          <p>这里允许老师查看完整信息；这些字段不会默认进入 AI 请求。</p>
          <dl className="detail-list">
            <div>
              <dt>是否特殊关爱</dt>
              <dd>{student.specialCare ? "是" : "否"}</dd>
            </div>
            <div>
              <dt>特殊关爱类型</dt>
              <dd>{student.careTypes?.join("、") || "未记录"}</dd>
            </div>
            <div>
              <dt>家庭情况</dt>
              <dd>{sensitive?.familySituation || sensitive?.financialAidSituation || "未记录"}</dd>
            </div>
            <div>
              <dt>心理健康相关记录</dt>
              <dd>{sensitive?.psychologicalNotes || sensitive?.medicalNotes || "未记录"}</dd>
            </div>
            <div><dt>宗教信仰</dt><dd>{sensitive?.religion || "未记录"}</dd></div>
            <div><dt>性取向</dt><dd>{sensitive?.sexualOrientation || "未记录"}</dd></div>
            <div><dt>其他自定义记录</dt><dd>{sensitive?.customFields.length ? sensitive.customFields.map((item) => `${item.label}：${item.value}`).join("；") : "未记录"}</dd></div>
          </dl>
          <CareEditor key={`${student.id}-${student.updatedAt}`} student={student} onSave={onUpdateCare} />
        </article>
        <article className="panel academic-visuals">
          <h2>成绩变化</h2>
          <div className="mini-metrics">
            <strong>{failedCount}<small>挂科门数</small></strong>
            <strong>{scores.at(-1)?.score ?? "—"}<small>最近平均成绩</small></strong>
            <strong>{rankings.at(-1)?.rank ?? "—"}<small>最近班级排名</small></strong>
          </div>
          {scores.length
            ? <TrendLine label="平均成绩变化折线图" points={scores.map((item) => ({ label: item.term, value: item.score! }))} />
            : <p>暂无成绩数据，导入后将自然扩展为长期趋势。</p>}
          <h2>排名变化</h2>
          <p className={`rank-change ${rankDelta !== undefined && rankDelta < 0 ? "down" : ""}`}>{rankChangeText}</p>
          {rankings.length
            ? <TrendLine label="班级排名变化折线图" lowerIsBetter points={rankings.map((item) => ({ label: item.term, value: item.rank! }))} />
            : <p>暂无排名数据。</p>}
          <h2>考勤趋势</h2>
          {attendanceTrend.length ? (
            <div className="attendance-trend" aria-label="最近若干周缺勤、迟到、请假趋势">
              {attendanceTrend.map((item) => (
                <div key={item.week}>
                  <span className="attendance-bars">
                    <i className="absent" style={{ height: `${Math.max(3, item.absent * 13)}px` }} title={`缺勤 ${item.absent}`} />
                    <i className="late" style={{ height: `${Math.max(3, item.late * 13)}px` }} title={`迟到 ${item.late}`} />
                    <i className="leave" style={{ height: `${Math.max(3, item.leave * 13)}px` }} title={`请假 ${item.leave}`} />
                  </span>
                  <span>{item.week.slice(5)}</span>
                </div>
              ))}
              <small className="attendance-legend">缺勤 · 迟到 · 请假</small>
            </div>
          ) : <p>暂无考勤变化记录。</p>}
          <p>图表只使用本地客观记录，不自动给学生定性。</p>
        </article>
        <article className="panel">
          <h2>班委任职与奖助评优</h2>
          {roles.length ? (
            roles.map((item) => (
              <p key={item.id}>
                {item.roleName} · {item.startDate}—{item.endDate || "至今"}
              </p>
            ))
          ) : (
            <p>
              {student.currentRole
                ? `当前任职：${student.currentRole}`
                : "暂无班委任职记录。"}
            </p>
          )}
          {awards.length ? (
            awards.map((item) => (
              <p key={item.id}>
                {space.awardProjects.find(
                  (project) => project.id === item.projectId,
                )?.name ?? item.type}
                {" · "}
                {item.status}
                {item.missingMaterials.length
                  ? ` · 缺 ${item.missingMaterials.join("、")}`
                  : " · 材料齐全"}
                {item.result ? ` · ${item.result}` : ""}
              </p>
            ))
          ) : (
            <p>暂无奖助或评优申请记录。</p>
          )}
        </article>
        <article className="panel">
          <h2>升学就业</h2>
          <dl className="detail-list">
            <div>
              <dt>当前方向</dt>
              <dd>
                {career?.direction || student.graduationDirection || "未明确"}
              </dd>
            </div>
            <div>
              <dt>专升本阶段</dt>
              <dd>{career?.furtherStudy?.stage || "未记录"}</dd>
            </div>
            <div>
              <dt>简历状态</dt>
              <dd>{career?.employment?.resumeStatus || "未记录"}</dd>
            </div>
            <div>
              <dt>求职进度</dt>
              <dd>
                {career?.employment
                  ? `${career.employment.applications ?? 0} 次投递 / ${career.employment.interviews ?? 0} 次面试`
                  : "未记录"}
              </dd>
            </div>
          </dl>
        </article>
        <article className="panel">
          <h2>当前待办</h2>
          {tasks.length ? (
            tasks.map((task) => (
              <p key={task.id}>
                <b>{task.type}</b> · {task.title} · {task.dueAt || "未设置日期"}
              </p>
            ))
          ) : (
            <Empty>{student.importedTaskCount ? `花名册显示 ${student.importedTaskCount} 项待办，但未导入待办明细。` : "当前没有待办。"}</Empty>
          )}
        </article>
        <article className="panel timeline full-span">
          <h2>事务与谈话时间线</h2>
          {!timelineItems.length ? (
            <Empty>尚无过程记录。</Empty>
          ) : (
            timelineItems.map((item) => (
              <div key={item.id}><i /><span>{item.date}</span><b>{item.title}</b><p>{item.text}</p></div>
            ))
          )}
        </article>
      </section>
    </>
  );
}

function EventCenter({
  space,
  onNew,
  onStudent,
  onTalk,
  onClose,
}: {
  space: V2Space;
  onNew: () => void;
  onStudent: (id: string) => void;
  onTalk: (id: string) => void;
  onClose: (id: string) => Promise<void>;
}) {
  return (
    <>
      <div className="v2-page-title">
        <div>
          <span>一事一链</span>
          <h1>事务中心</h1>
          <p>来源 → 登记 → 待办 → 谈话/处理 → 跟进 → 结案。</p>
        </div>
        <button className="primary" onClick={onNew}>
          ＋ 登记事件
        </button>
      </div>
      {!space.events.length ? (
        <Empty>
          <h2>还没有登记事件</h2>
          <p>可以从一条班委反馈开始，30 秒形成可追溯的处理链。</p>
          <button onClick={onNew}>登记第一件事</button>
        </Empty>
      ) : (
        <section className="event-list">
          {space.events.map((event) => {
            const pending = space.tasks.filter(
              (task) => task.eventId === event.id && task.status === "待处理",
            );
            const progress = eventProgress(event, space.tasks);
            return (
              <article className="panel event-card" key={event.id}>
                <div className="event-head">
                  <div>
                    <span className={`priority ${event.priority}`}>
                      {event.priority === "high"
                        ? "紧急"
                        : event.priority === "medium"
                          ? "一般"
                          : "普通"}
                    </span>
                    <b>{event.type}</b>
                    <button
                      className="link-button"
                      onClick={() => onStudent(event.studentId)}
                    >
                      {studentName(space, event.studentId)} →
                    </button>
                  </div>
                  <span className="status">{event.status}</span>
                </div>
                <p>{event.facts}</p>
                <small>
                  {event.occurredAt} · {sourceLabels[event.sourceType]} ·{" "}
                  {pending.length} 个待办
                </small>
                <div className="event-progress" aria-label="事件处理进度">
                  {["登记", "待谈话", "已谈话", "复查", "完成", "结案"].map(
                    (label, index) => (
                      <span
                        className={index <= progress ? "done" : ""}
                        key={label}
                      >
                        <i>{index < progress ? "✓" : index + 1}</i>
                        {label}
                      </span>
                    ),
                  )}
                </div>
                <div className="button-row">
                  {event.needsConversation &&
                    !event.relatedConversationIds.length && (
                      <button
                        className="primary"
                        onClick={() => onTalk(event.id)}
                      >
                        记录本次谈话
                      </button>
                    )}
                  {event.status === "已完成" && (
                    <button onClick={() => void onClose(event.id)}>
                      确认结案
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

function TaskCenter({
  space,
  focus,
  onStudent,
  onEvent,
  onAdd,
  onTalk,
  onComplete,
}: {
  space: V2Space;
  /** 首页 KPI 卡片带来的筛选聚焦（待谈话 / 超期等）。 */
  focus?: { type?: string; scope?: "超期" };
  onStudent: (id: string) => void;
  onEvent: (id: string) => void;
  onAdd: (task: Parameters<typeof addTaskRecord>[1]) => Promise<void>;
  onTalk: (task: TaskRecord) => void;
  onComplete: (task: TaskRecord) => Promise<void>;
}) {
  const [scope, setScope] = useState<
    "待处理" | "今日" | "本周" | "超期" | "已完成"
  >("待处理");
  const [type, setType] = useState("");
  const studentSystemUrl = useStudentSystemUrl();
  useEffect(() => {
    setScope(focus?.scope ?? "待处理");
    setType(focus?.type ?? "");
  }, [focus]);
  const today = isoDay();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const tasks = space.tasks.filter((task) => {
    if (type && task.type !== type) return false;
    if (scope === "已完成") return task.status === "已完成";
    if (task.status !== "待处理") return false;
    if (scope === "今日") return task.dueAt === today;
    if (scope === "本周")
      return (
        !!task.dueAt &&
        task.dueAt >= today &&
        task.dueAt <= weekEnd.toISOString().slice(0, 10)
      );
    if (scope === "超期") return !!task.dueAt && task.dueAt < today;
    return true;
  });
  const taskTypes = [
    "待谈话",
    "待联系",
    "待核实",
    "待复查",
    "待收材料",
    "待回访",
    "待回填学工系统",
    "自定义",
  ];
  return (
    <>
      <div className="v2-page-title">
        <div>
          <span>执行中心</span>
          <h1>待办</h1>
          <p>每一项都能反向定位到学生、事件和谈话。</p>
        </div>
      </div>
      <div className="task-toolbar">
        <div className="segmented">
          {(["待处理", "今日", "本周", "超期", "已完成"] as const).map(
            (item) => (
              <button
                key={item}
                className={scope === item ? "active" : ""}
                onClick={() => setScope(item)}
              >
                {item}
                {item === "待处理"
                  ? `（${space.tasks.filter((task) => task.status === "待处理").length}）`
                  : ""}
              </button>
            ),
          )}
        </div>
        <label>
          类型
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">全部类型</option>
            {taskTypes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <details className="panel add-task-panel">
        <summary>＋ 添加待办</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onAdd({
              studentId: String(data.get("studentId")) || undefined,
              type: String(data.get("type")),
              title: String(data.get("title")),
              dueAt: String(data.get("dueAt")) || undefined,
              priority: String(data.get("priority")) as TaskRecord["priority"],
            });
            event.currentTarget.reset();
          }}
        >
          <div className="field-grid">
            <label>
              学生
              <select name="studentId">
                <option value="">不关联学生</option>
                {space.students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              类型
              <select name="type">
                {taskTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              截止日期
              <input type="date" name="dueAt" />
            </label>
            <label>
              优先级
              <select name="priority">
                <option value="low">普通</option>
                <option value="medium">一般</option>
                <option value="high">紧急</option>
              </select>
            </label>
          </div>
          <label>
            标题
            <input name="title" required />
          </label>
          <button className="primary" type="submit">
            保存待办
          </button>
        </form>
      </details>
      {!tasks.length ? (
        <Empty>当前分类没有待办。</Empty>
      ) : (
        <section className="panel task-list">
          {tasks.map((task) => (
            <div className="task-row" key={task.id}>
              <span className={`priority ${task.priority}`}>{task.type}</span>
              <div>
                <b>{task.title}</b>
                <p>
                  <button
                    className="link-button"
                    onClick={() => task.studentId && onStudent(task.studentId)}
                  >
                    {studentName(space, task.studentId)}
                  </button>{" "}
                  ·{" "}
                  {task.eventId ? (
                    <button
                      className="link-button"
                      onClick={() => onEvent(task.eventId!)}
                    >
                      查看原始事件
                    </button>
                  ) : (
                    "独立待办"
                  )}
                  {task.type === "待回填学工系统" && studentSystemUrl && (
                    <>
                      {" · "}
                      <a
                        className="link-button"
                        {...externalLinkProps(studentSystemUrl)}
                      >
                        去学工系统回填 ↗
                      </a>
                    </>
                  )}
                </p>
              </div>
              <time>{task.dueAt || "无截止时间"}</time>
              {task.status === "待处理" &&
                (task.type === "待谈话" ? (
                  <button className="primary" onClick={() => onTalk(task)}>
                    开始谈话
                  </button>
                ) : (
                  <button onClick={() => void onComplete(task)}>
                    完成复查
                  </button>
                ))}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function ConversationCenter({
  space,
  onStudent,
  onNew,
  onTemplates,
  onExport,
  onPolish,
}: {
  space: V2Space;
  onStudent: (id: string) => void;
  onNew: () => void;
  onExport: (items: ConversationRecord[]) => void;
  /** 打开这条谈话记录的 AI 润色弹窗。 */
  onPolish: (item: ConversationRecord) => void;
  onTemplates: (templates: ConversationTemplate[]) => Promise<void>;
}) {
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const studentSystemUrl = useStudentSystemUrl();
  const records = sortConversations(space.conversations);
  const visible = showAll ? records : records.slice(0, RECENT_TALK_COUNT);
  const hiddenCount = records.length - visible.length;
  return (
    <>
      <div className="v2-page-title">
        <div>
          <span>谈前有模板，谈后可成文</span>
          <h1>谈心谈话</h1>
          <p>
            工作台不做语音识别；可使用
            Typeless、豆包语音输入法或微信输入法完成口述输入。
          </p>
        </div>
        <button className="primary" onClick={onNew}>
          发起一次谈心谈话
        </button>
      </div>
      {/* 谈话记录前置：记录是老师最常回看的内容，模板库放在它后面。 */}
      <section className="panel talk-ledger">
        <div className="section-title">
          <div>
            <h2>谈话记录</h2>
            <p>
              {records.length
                ? `共 ${records.length} 条 · 按谈话日期倒序${
                    hiddenCount > 0
                      ? `，当前显示最近 ${visible.length} 条`
                      : ""
                  }`
                : "还没有谈话记录。"}
            </p>
          </div>
          {records.length > 0 && (
            <div className="button-row">
              {hiddenCount > 0 && (
                <button onClick={() => setShowAll(true)}>
                  查看全部 {records.length} 条
                </button>
              )}
              {showAll && records.length > RECENT_TALK_COUNT && (
                <button onClick={() => setShowAll(false)}>
                  只看最近 {RECENT_TALK_COUNT} 条
                </button>
              )}
              <button className="primary" onClick={() => onExport(records)}>
                导出全部（Markdown）
              </button>
            </div>
          )}
        </div>
        {!!copyError && (
          <p className="notice" role="alert">
            {copyError}
            <button onClick={() => setCopyError("")}>×</button>
          </p>
        )}
        {!records.length ? (
          <Empty>
            <h2>暂无已完成谈话</h2>
            <p>
              点右上角「发起一次谈心谈话」直接记录，无需先登记事件；从“事务”或“待办”进入的谈话同样会收在这里。
            </p>
          </Empty>
        ) : (
          <section className="conversation-grid">
            {visible.map((item) => (
              <article className="panel" key={item.id}>
                <span className="badge green">
                  {item.aiUsed ? "AI 辅助成文" : "本地模板成文"}
                </span>
                <h2>{item.scenario}</h2>
                <button
                  className="link-button"
                  onClick={() => onStudent(item.studentId)}
                >
                  {studentName(space, item.studentId)} →
                </button>
                <ConversationFields item={item} />
                <details>
                  <summary>查看标准记录</summary>
                  <pre>{item.finalRecord}</pre>
                </details>
                <div className="button-row">
                  <button
                    onClick={async () => {
                      if (await copyText(item.finalRecord ?? "")) {
                        setCopied(item.id);
                        setCopyError("");
                      } else {
                        setCopyError(
                          "复制失败，请展开「查看标准记录」手动选中文本复制。",
                        );
                      }
                    }}
                  >
                    {copied === item.id ? "已复制学工系统版本" : "复制学工系统版本"}
                  </button>
                  {copied === item.id && !!studentSystemUrl && (
                    <a
                      className="button system-goto"
                      {...externalLinkProps(studentSystemUrl)}
                    >
                      去学工系统粘贴 ↗
                    </a>
                  )}
                  <button onClick={() => onExport([item])}>导出此条</button>
                  <button onClick={() => onPolish(item)}>AI 润色</button>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
      <TemplateManager
        templates={space.conversationTemplates}
        onCommit={onTemplates}
      />
    </>
  );
}

/** 谈话记录的字段明细：谈心谈话页与个人看板共用，保证两处展示一致。 */
function ConversationFields({ item }: { item: ConversationRecord }) {
  const row = (label: string, value?: string) =>
    value?.trim() ? (
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ) : null;
  return (
    <dl className="detail-list">
      {row("谈话日期", item.happenedAt)}
      {row("谈话地点", item.location || "未填写")}
      {row("学生主要表达", item.studentExpression)}
      {row("班主任引导", item.counselorGuidance)}
      {row("共识措施", item.agreements)}
      {row("后续跟进", item.followUpPlan)}
      {row("复查日期", item.nextFollowUpAt)}
      {row("口述原始记录", item.rawNotes)}
    </dl>
  );
}

function Modal({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && onCancel()
      }
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-title">
          <div>
            <span className="eyebrow">LOCAL RECORD</span>
            <h2>{title}</h2>
          </div>
          <button aria-label="关闭" onClick={onCancel}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function EventForm({
  students,
  initialStudentId,
  onCancel,
  onSubmit,
}: {
  students: StudentRecord[];
  initialStudentId?: string;
  onCancel: () => void;
  onSubmit: (data: Parameters<typeof registerEvent>[1]) => Promise<void>;
}) {
  const [studentId, setStudentId] = useState(
    initialStudentId ?? students[0]?.id ?? "",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit({
      studentId,
      type: String(form.get("type")),
      occurredAt: String(form.get("occurredAt")),
      sourceType: String(form.get("sourceType")) as Parameters<
        typeof registerEvent
      >[1]["sourceType"],
      sourceText: String(form.get("sourceText") ?? ""),
      facts: String(form.get("facts")),
      priority: String(form.get("priority")) as Parameters<
        typeof registerEvent
      >[1]["priority"],
      needsConversation: form.get("needsConversation") === "on",
      needsFollowUp: form.get("needsFollowUp") === "on",
    });
  }
  return (
    <Modal title="登记一件事" onCancel={onCancel}>
      {!students.length ? (
        <Empty>请先导入花名册。</Empty>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <div className="field-grid two">
            <label>
              学生 *
              <select
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                required
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} · {student.studentNo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              事件类型 *
              <select name="type" defaultValue="缺勤">
                {EVENT_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              发生日期 *
              <input
                name="occurredAt"
                type="date"
                defaultValue={isoDay()}
                required
              />
            </label>
            <label>
              来源 *
              <select name="sourceType" defaultValue="class_committee">
                {Object.entries(sourceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              来源补充
              <input name="sourceText" placeholder="如：学习委员微信反馈" />
            </label>
            <label>
              紧急程度
              <select name="priority" defaultValue="medium">
                <option value="low">普通</option>
                <option value="medium">一般</option>
                <option value="high">紧急</option>
              </select>
            </label>
          </div>
          <label>
            事实描述 *
            <textarea
              name="facts"
              required
              placeholder="只写已知事实，例如：学习委员反馈，该生今天第 1、2 节课未到，暂未确认原因。"
            />
          </label>
          <div className="check-row">
            <label className="check">
              <input type="checkbox" name="needsConversation" defaultChecked />
              需要谈话（自动生成待谈话）
            </label>
            <label className="check">
              <input type="checkbox" name="needsFollowUp" defaultChecked />
              需要后续跟进
            </label>
          </div>
          <p className="privacy-note">
            这里只登记本地过程事实；AI 属于可选项，且只在 Privacy Gateway
            确认后按需使用。
          </p>
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>
              取消
            </button>
            <button className="primary" type="submit">
              保存并生成待办
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * 直接发起一次谈心谈话。
 *
 * 和 `TalkForm`（从事件 / 待办进入）的差别在入口：这里没有前置事件，
 * 老师先选学生和主题，谈完即存。是否在「事务」留痕、是否安排复查提醒
 * 都是表单里的显式勾选，默认都不额外制造负担——尤其是**不再生成「待谈话」待办**。
 */
function NewTalkForm({
  students,
  initialStudentId,
  initialTopic,
  templates,
  onCancel,
  onSubmit,
}: {
  students: StudentRecord[];
  initialStudentId?: string;
  initialTopic?: string;
  templates: ConversationTemplate[];
  onCancel: () => void;
  onSubmit: (
    input: Parameters<typeof recordStandaloneConversation>[1],
  ) => Promise<void>;
}) {
  const [studentId, setStudentId] = useState(
    initialStudentId ?? students[0]?.id ?? "",
  );
  const [topic, setTopic] = useState(initialTopic ?? "缺勤");
  const [archiveEvent, setArchiveEvent] = useState(true);
  const [remind, setRemind] = useState(false);
  const student = students.find((item) => item.id === studentId);
  const template = templates.find((item) => item.isDefault) ?? templates[0];

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    await onSubmit({
      studentId,
      topic,
      background: String(data.get("background") ?? ""),
      templateId: template?.id,
      happenedAt: String(data.get("happenedAt")),
      location: String(data.get("location") ?? ""),
      rawNotes: String(data.get("rawNotes")),
      studentExpression: String(data.get("studentExpression")),
      counselorGuidance: String(data.get("counselorGuidance")),
      agreements: String(data.get("agreements")),
      followUpPlan: String(data.get("followUpPlan")),
      nextFollowUpAt: remind
        ? String(data.get("nextFollowUpAt") ?? "") || undefined
        : undefined,
      archiveEvent,
      needsFollowUpTask: remind,
    });
  }
  return (
    <Modal
      title={
        student ? `发起一次谈心谈话 · ${student.name}` : "发起一次谈心谈话"
      }
      onCancel={onCancel}
    >
      {!students.length ? (
        <Empty>请先导入花名册。</Empty>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <div className="field-grid two">
            <label>
              学生 *
              <select
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                required
              >
                {students.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.studentNo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              谈话主题 *
              <select
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              谈话日期 *
              <input
                name="happenedAt"
                type="date"
                defaultValue={isoDay()}
                required
              />
            </label>
            <label>
              谈话地点
              <input name="location" placeholder="办公室 / 教室等" />
            </label>
          </div>
          <label>
            谈话背景（可选）
            <textarea
              name="background"
              placeholder="为什么谈这次话？只写已知事实；留空时按主题生成一句中性说明。"
            />
          </label>
          <label>
            口述原始记录 *
            <textarea
              name="rawNotes"
              required
              placeholder="可使用 Typeless、豆包语音输入法或微信输入法口述；系统不集成语音识别。"
            />
          </label>
          <div className="field-grid two">
            <label>
              学生主要表达
              <textarea
                name="studentExpression"
                placeholder="可不填；未填写时会使用口述原始记录。"
              />
            </label>
            <label>
              班主任沟通与引导
              <textarea name="counselorGuidance" />
            </label>
            <label>
              达成的共识 / 措施
              <textarea name="agreements" />
            </label>
            <label>
              后续跟进事项
              <textarea name="followUpPlan" />
            </label>
          </div>
          <div className="check-row">
            <label className="check">
              <input
                type="checkbox"
                checked={archiveEvent}
                onChange={(event) => setArchiveEvent(event.target.checked)}
              />
              同时在「事务」留一条记录（便于归档与材料引用）
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={remind}
                onChange={(event) => setRemind(event.target.checked)}
              />
              需要复查提醒（生成待办）
            </label>
          </div>
          {remind && (
            <label>
              复查日期
              <input
                name="nextFollowUpAt"
                type="date"
                defaultValue={dayAfter(7)}
              />
            </label>
          )}
          <p className="privacy-note">
            谈完即归档，不再自动生成「待谈话」待办。本次使用本地模板成文，不调用
            AI；不做心理诊断，不添加未提供的事实。
          </p>
          <div className="modal-actions">
            <button type="button" onClick={onCancel}>
              取消
            </button>
            <button className="primary" type="submit">
              保存谈话记录{remind ? "并设复查提醒" : ""}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function TalkForm({
  event,
  template,
  studentName,
  onCancel,
  onSubmit,
}: {
  event: EventRecord;
  template: ConversationTemplate;
  studentName: string;
  onCancel: () => void;
  onSubmit: (
    input: Parameters<typeof completeEventConversation>[1],
  ) => Promise<void>;
}) {
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    await onSubmit({
      eventId: event.id,
      templateId: template.id,
      happenedAt: String(data.get("happenedAt")),
      location: String(data.get("location") ?? ""),
      rawNotes: String(data.get("rawNotes")),
      studentExpression: String(data.get("studentExpression")),
      counselorGuidance: String(data.get("counselorGuidance")),
      agreements: String(data.get("agreements")),
      followUpPlan: String(data.get("followUpPlan")),
      nextFollowUpAt: String(data.get("nextFollowUpAt") ?? "") || undefined,
    });
  }
  return (
    <Modal title={`记录谈话 · ${studentName}`} onCancel={onCancel}>
      <div className="talk-context">
        <b>已知事实</b>
        <p>{event.facts}</p>
        <small>
          {template.name}模板：{template.talkDirections.join("；")}
        </small>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="field-grid two">
          <label>
            谈话日期 *
            <input
              type="date"
              name="happenedAt"
              defaultValue={isoDay()}
              required
            />
          </label>
          <label>
            地点
            <input name="location" placeholder="办公室 / 教室等" />
          </label>
        </div>
        <label>
          口述原始记录 *
          <textarea
            name="rawNotes"
            required
            placeholder="可使用 Typeless、豆包语音输入法或微信输入法口述；系统不集成语音识别。"
          />
        </label>
        <div className="field-grid two">
          <label>
            学生主要表达
            <textarea
              name="studentExpression"
              placeholder="可不填；未填写时会使用口述原始记录。"
            />
          </label>
          <label>
            班主任沟通与引导
            <textarea name="counselorGuidance" />
          </label>
          <label>
            达成的共识 / 措施
            <textarea name="agreements" />
          </label>
          <label>
            后续跟进事项
            <textarea name="followUpPlan" />
          </label>
          <label>
            复查日期
            <input
              type="date"
              name="nextFollowUpAt"
              defaultValue={dayAfter(7)}
            />
          </label>
        </div>
        <p className="privacy-note">
          本次使用本地模板成文，不调用 AI；不做心理诊断，不添加未提供的事实。
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary" type="submit">
            保存谈话并生成复查待办
          </button>
        </div>
      </form>
    </Modal>
  );
}
