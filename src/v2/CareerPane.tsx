import { useEffect, useState, type FormEvent } from "react";
import { careerFilter } from "./business";
import { generateLocalMaterial } from "./materials";
import type {
  CareerPlan,
  GraduationDirection,
  StudentRecord,
  V2Space,
} from "./types";

type Filter = Parameters<typeof careerFilter>[1];
const directions: GraduationDirection[] = [
  "未明确",
  "专升本",
  "就业",
  "考公 / 考编",
  "创业",
  "其他",
];

export function CareerPane({
  space,
  focusStudentId,
  initialFilter,
  onSave,
  onStudent,
  onStartTalk,
  onTask,
  onGateway,
}: {
  space: V2Space;
  focusStudentId?: string;
  /** 首页 KPI 卡片带来的筛选聚焦（如「就业方向未明确」）。 */
  initialFilter?: Filter;
  onSave: (plan: CareerPlan) => Promise<void>;
  onStudent: (id: string) => void;
  onStartTalk: (
    student: StudentRecord,
    type: "就业" | "专升本",
  ) => Promise<void>;
  onTask: (
    studentId: string,
    type: string,
    title: string,
    dueAt?: string,
  ) => Promise<void>;
  onGateway: (args: {
    studentId: string;
    title: string;
    sourceText: string;
    purpose: "career";
  }) => void;
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter ?? "all");
  useEffect(() => {
    setFilter(initialFilter ?? "all");
  }, [initialFilter]);
  const [editingId, setEditingId] = useState<string | undefined>(
    focusStudentId,
  );
  const students = careerFilter(space, filter);
  const counts = {
    noDirection: careerFilter(space, "no-direction").length,
    noPlan: careerFilter(space, "upgrade-no-plan").length,
    noResume: careerFilter(space, "no-resume").length,
    stale: careerFilter(space, "stale").length,
  };
  return (
    <>
      <div className="v2-page-title">
        <div>
          <span>升学就业</span>
          <h1>一眼找到下一步还不明确的学生</h1>
          <p>方向、计划和求职进度来自本地学生档案。</p>
        </div>
      </div>
      <section className="v2-kpis career-kpis">
        <button onClick={() => setFilter("no-direction")}>
          <span>方向未明确</span>
          <strong>{counts.noDirection}</strong>
          <small>查看学生 →</small>
        </button>
        <button onClick={() => setFilter("upgrade-no-plan")}>
          <span>专升本未制定计划</span>
          <strong>{counts.noPlan}</strong>
          <small>查看学生 →</small>
        </button>
        <button onClick={() => setFilter("no-resume")}>
          <span>就业暂无简历</span>
          <strong>{counts.noResume}</strong>
          <small>查看学生 →</small>
        </button>
        <button onClick={() => setFilter("stale")}>
          <span>超过 30 天未更新</span>
          <strong>{counts.stale}</strong>
          <small>查看学生 →</small>
        </button>
      </section>
      <div className="filter-pills">
        {(
          [
            ["all", "全部"],
            ["upgrade", "专升本方向"],
            ["no-direction", "方向未明确"],
            ["upgrade-no-plan", "专升本未制定计划"],
            ["upgrade-no-school", "专升本无目标院校"],
            ["no-resume", "没有简历"],
            ["no-applications", "尚未投递"],
            ["stale", "长期无进展"],
            ["offer-unsigned", "有 offer 未签约"],
            ["signed", "已签约"],
          ] as Array<[Filter, string]>
        ).map(([value, label]) => (
          <button
            className={filter === value ? "active" : ""}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {!students.length ? (
        <div className="v2-empty">当前筛选下没有学生。</div>
      ) : (
        <section className="panel">
          <div className="table-scroll">
            <table className="v2-table career-table">
              <thead>
                <tr>
                  <th>学生</th>
                  <th>毕业方向</th>
                  <th>目标 / 求职方向</th>
                  <th>计划 / 简历</th>
                  <th>投递</th>
                  <th>面试</th>
                  <th>offer</th>
                  <th>最近跟进</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const plan = space.careerPlans.find(
                    (item) => item.studentId === student.id,
                  );
                  const direction =
                    plan?.direction ?? student.graduationDirection ?? "未明确";
                  return (
                    <tr key={student.id}>
                      <td>
                        <button
                          className="link-button"
                          onClick={() => onStudent(student.id)}
                        >
                          <b>{student.name}</b>
                          <small>{student.studentNo}</small>
                        </button>
                      </td>
                      <td>{direction}</td>
                      <td>
                        {direction === "专升本"
                          ? plan?.furtherStudy?.targetSchool || "目标院校未明确"
                          : direction === "就业"
                            ? plan?.employment?.targetRole || "求职方向未明确"
                            : "—"}
                      </td>
                      <td>
                        {direction === "专升本"
                          ? plan?.furtherStudy?.planStatus || "未制定"
                          : direction === "就业"
                            ? plan?.employment?.resumeStatus || "无简历"
                            : "—"}
                      </td>
                      <td>{plan?.employment?.applications ?? 0}</td>
                      <td>{plan?.employment?.interviews ?? 0}</td>
                      <td>{plan?.employment?.offers ?? 0}</td>
                      <td>
                        {plan?.furtherStudy?.lastFollowUp ||
                          plan?.employment?.lastFollowUp ||
                          "未记录"}
                      </td>
                      <td>
                        <button onClick={() => setEditingId(student.id)}>
                          打开档案 →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {editingId &&
        space.students.find((student) => student.id === editingId) && (
          <CareerEditor
            student={space.students.find(
              (student) => student.id === editingId,
            )!}
            plan={space.careerPlans.find(
              (item) => item.studentId === editingId,
            )}
            onClose={() => setEditingId(undefined)}
            onSave={onSave}
            onTalk={onStartTalk}
            onTask={onTask}
            onGateway={(type) => {
              const student = space.students.find(
                (item) => item.id === editingId,
              )!;
              const materialType = type === "专升本" ? "upgrade" : "employment";
              const draft = generateLocalMaterial(
                space,
                materialType,
                editingId,
              );
              onGateway({
                studentId: editingId,
                title:
                  type === "专升本"
                    ? "AI 帮我制定专升本计划"
                    : "AI 帮我准备简历 / 面试",
                sourceText: draft.content,
                purpose: "career",
              });
            }}
          />
        )}
    </>
  );
}

function CareerEditor({
  student,
  plan,
  onClose,
  onSave,
  onTalk,
  onTask,
  onGateway,
}: {
  student: StudentRecord;
  plan?: CareerPlan;
  onClose: () => void;
  onSave: (plan: CareerPlan) => Promise<void>;
  onTalk: (student: StudentRecord, type: "就业" | "专升本") => Promise<void>;
  onTask: (
    studentId: string,
    type: string,
    title: string,
    dueAt?: string,
  ) => Promise<void>;
  onGateway: (type: "就业" | "专升本") => void;
}) {
  const [direction, setDirection] = useState<GraduationDirection>(
    plan?.direction ?? student.graduationDirection ?? "未明确",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: CareerPlan = { studentId: student.id, direction };
    if (direction === "专升本")
      next.furtherStudy = {
        targetSchool: String(data.get("targetSchool")),
        targetMajor: String(data.get("targetMajor")),
        stage: String(data.get("stage")),
        planStatus: String(data.get("planStatus")),
        recentStudy: String(data.get("recentStudy")),
        difficulties: String(data.get("difficulties")),
        lastConversationAt: String(data.get("lastConversationAt")),
        lastFollowUp: String(data.get("lastFollowUp")),
        nextFollowUp: String(data.get("nextFollowUp")),
        notes: String(data.get("notes")),
        mockExamRecords: String(data.get("mockExamRecords"))
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [date, score, ...notes] = line.split(/[|｜]/);
            const numericScore = Number(score?.trim());
            return {
              date: date?.trim() || "日期未记录",
              score: Number.isFinite(numericScore) ? numericScore : undefined,
              notes: notes.join("｜").trim() || undefined,
            };
          }),
      };
    if (direction === "就业")
      next.employment = {
        targetRole: String(data.get("targetRole")),
        preferredRegion: String(data.get("preferredRegion")),
        resumeStatus: String(data.get("resumeStatus")),
        applications: Number(data.get("applications") || 0),
        interviews: Number(data.get("interviews") || 0),
        offers: Number(data.get("offers") || 0),
        signed: data.get("signed") === "on",
        internshipCompany: String(data.get("internshipCompany")),
        currentStatus: String(data.get("currentStatus")),
        lastFollowUp: String(data.get("lastFollowUp")),
        nextStep: String(data.get("nextStep")),
      };
    await onSave(next);
  }
  const defaultDue = new Date(Date.now() + 14 * 86400000)
    .toISOString()
    .slice(0, 10);
  return (
    <div className="modal-backdrop">
      <section
        className="modal career-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`${student.name}升学就业档案`}
      >
        <div className="section-title">
          <div>
            <span className="eyebrow">LOCAL CAREER FILE</span>
            <h2>{student.name} · 升学就业档案</h2>
          </div>
          <button aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            毕业方向
            <select
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as GraduationDirection)
              }
            >
              {directions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          {direction === "专升本" && (
            <>
              <div className="field-grid two">
                <label>
                  目标院校
                  <input
                    name="targetSchool"
                    defaultValue={plan?.furtherStudy?.targetSchool}
                  />
                </label>
                <label>
                  目标专业
                  <input
                    name="targetMajor"
                    defaultValue={plan?.furtherStudy?.targetMajor}
                  />
                </label>
                <label>
                  当前阶段
                  <input
                    name="stage"
                    defaultValue={plan?.furtherStudy?.stage}
                    placeholder="基础复习 / 强化 / 冲刺"
                  />
                </label>
                <label>
                  计划状态
                  <select
                    name="planStatus"
                    defaultValue={plan?.furtherStudy?.planStatus || "未制定"}
                  >
                    <option>未制定</option>
                    <option>制定中</option>
                    <option>已制定</option>
                    <option>执行中</option>
                  </select>
                </label>
                <label>
                  最近一次谈话
                  <input
                    type="date"
                    name="lastConversationAt"
                    defaultValue={plan?.furtherStudy?.lastConversationAt}
                  />
                </label>
                <label>
                  最近跟进
                  <input
                    type="date"
                    name="lastFollowUp"
                    defaultValue={plan?.furtherStudy?.lastFollowUp}
                  />
                </label>
                <label>
                  下次跟进
                  <input
                    type="date"
                    name="nextFollowUp"
                    defaultValue={plan?.furtherStudy?.nextFollowUp}
                  />
                </label>
              </div>
              <label>
                最近复习情况
                <textarea
                  name="recentStudy"
                  defaultValue={plan?.furtherStudy?.recentStudy}
                />
              </label>
              <label>
                当前困难
                <textarea
                  name="difficulties"
                  defaultValue={plan?.furtherStudy?.difficulties}
                />
              </label>
              <label>
                模考记录（每行：日期｜分数｜备注）
                <textarea
                  name="mockExamRecords"
                  placeholder="2026-09-01｜236｜英语阅读需要加强"
                  defaultValue={plan?.furtherStudy?.mockExamRecords
                    ?.map(
                      (item) =>
                        `${item.date}｜${item.score ?? ""}｜${item.notes ?? ""}`,
                    )
                    .join("\n")}
                />
              </label>
              <label>
                备注
                <textarea
                  name="notes"
                  defaultValue={plan?.furtherStudy?.notes}
                />
              </label>
            </>
          )}
          {direction === "就业" && (
            <>
              <div className="field-grid two">
                <label>
                  求职方向
                  <input
                    name="targetRole"
                    defaultValue={plan?.employment?.targetRole}
                  />
                </label>
                <label>
                  地域意向
                  <input
                    name="preferredRegion"
                    defaultValue={plan?.employment?.preferredRegion}
                  />
                </label>
                <label>
                  简历状态
                  <select
                    name="resumeStatus"
                    defaultValue={plan?.employment?.resumeStatus || "无简历"}
                  >
                    <option>无简历</option>
                    <option>整理中</option>
                    <option>已完成</option>
                    <option>待优化</option>
                  </select>
                </label>
                <label>
                  实习单位
                  <input
                    name="internshipCompany"
                    defaultValue={plan?.employment?.internshipCompany}
                  />
                </label>
                <label>
                  已投递数量
                  <input
                    type="number"
                    min="0"
                    name="applications"
                    defaultValue={plan?.employment?.applications ?? 0}
                  />
                </label>
                <label>
                  面试次数
                  <input
                    type="number"
                    min="0"
                    name="interviews"
                    defaultValue={plan?.employment?.interviews ?? 0}
                  />
                </label>
                <label>
                  offer 数量
                  <input
                    type="number"
                    min="0"
                    name="offers"
                    defaultValue={plan?.employment?.offers ?? 0}
                  />
                </label>
                <label>
                  当前状态
                  <input
                    name="currentStatus"
                    defaultValue={plan?.employment?.currentStatus}
                  />
                </label>
                <label>
                  最近跟进
                  <input
                    type="date"
                    name="lastFollowUp"
                    defaultValue={plan?.employment?.lastFollowUp}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="signed"
                    defaultChecked={plan?.employment?.signed}
                  />
                  已签约
                </label>
              </div>
              <label>
                下一步
                <textarea
                  name="nextStep"
                  defaultValue={plan?.employment?.nextStep}
                />
              </label>
            </>
          )}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              关闭
            </button>
            <button className="primary" type="submit">
              保存档案
            </button>
          </div>
        </form>
        {(direction === "就业" || direction === "专升本") && (
          <div className="career-actions">
            <button onClick={() => void onTalk(student, direction)}>
              发起{direction}谈话
            </button>
            <button
              onClick={() =>
                void onTask(
                  student.id,
                  direction === "就业" ? "待核实" : "待复查",
                  direction === "就业"
                    ? "完善简历并更新投递进度"
                    : "两周后复盘专升本计划",
                  defaultDue,
                )
              }
            >
              创建两周后跟进
            </button>
            <button onClick={() => onGateway(direction)}>
              AI 辅助{direction === "就业" ? "简历 / 面试" : "计划"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
