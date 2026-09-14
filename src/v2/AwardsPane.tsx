import { useMemo, useState, type FormEvent } from "react";
import { generateLocalMaterial } from "./materials";
import type {
  AwardApplication,
  AwardProject,
  AwardStatus,
  StudentRecord,
  V2Space,
} from "./types";

const statuses: AwardStatus[] = [
  "待筛选",
  "候选",
  "待补材料",
  "材料齐全",
  "已提交",
  "通过",
  "未通过",
  "已归档",
];

export function AwardsPane({
  space,
  onCreateProject,
  onAddCandidate,
  onUpdate,
  onBulk,
  onStudent,
  onGateway,
}: {
  space: V2Space;
  onCreateProject: (
    project: Omit<AwardProject, "id" | "createdAt">,
  ) => Promise<void>;
  onAddCandidate: (
    projectId: string,
    studentId: string,
    eligible: boolean,
  ) => Promise<void>;
  onUpdate: (id: string, patch: Partial<AwardApplication>) => Promise<void>;
  onBulk: (ids: string[], status: AwardStatus) => Promise<void>;
  onStudent: (id: string) => void;
  onGateway: (args: {
    studentId: string;
    title: string;
    sourceText: string;
    purpose: "award";
    awardApplicationId: string;
  }) => void;
}) {
  const [projectId, setProjectId] = useState(space.awardProjects[0]?.id ?? "");
  const [filter, setFilter] = useState<
    "all" | "missing" | "due" | "unsubmitted" | "passed" | "failed"
  >("all");
  const [selected, setSelected] = useState<string[]>([]);
  const activeProject = space.awardProjects.find(
    (item) => item.id === projectId,
  );
  const applications = useMemo(() => {
    const today = new Date();
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 7);
    const soonText = soon.toISOString().slice(0, 10);
    return space.awardApplications.filter((item) => {
      if (projectId && item.projectId !== projectId) return false;
      if (filter === "missing") return item.missingMaterials.length > 0;
      if (filter === "due")
        return (
          !!item.deadline &&
          item.deadline >= today.toISOString().slice(0, 10) &&
          item.deadline <= soonText
        );
      if (filter === "unsubmitted")
        return !["已提交", "通过", "未通过", "已归档"].includes(item.status);
      if (filter === "passed") return item.status === "通过";
      if (filter === "failed") return item.status === "未通过";
      return true;
    });
  }, [space.awardApplications, projectId, filter]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await onCreateProject({
      name: String(data.get("name")),
      type: String(data.get("type")) as AwardProject["type"],
      year: String(data.get("year")),
      term: String(data.get("term")),
      deadline: String(data.get("deadline")) || undefined,
      requiredMaterials: String(data.get("materials"))
        .split(/[、,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
      notes: String(data.get("notes")),
    });
    form.reset();
  }

  return (
    <>
      <div className="v2-page-title">
        <div>
          <span>评奖评优 / 奖助</span>
          <h1>项目、候选人与材料进度</h1>
          <p>从待筛选到归档，每名候选人的材料和结果都回到学生档案。</p>
        </div>
      </div>
      <details
        className="panel module-create"
        open={!space.awardProjects.length}
      >
        <summary>＋ 建立评奖评优 / 奖助项目</summary>
        <form onSubmit={(event) => void create(event)}>
          <div className="field-grid">
            <label>
              项目名称
              <input
                name="name"
                required
                placeholder="2026 年优秀学生干部评选"
              />
            </label>
            <label>
              类型
              <select name="type">
                {[
                  "奖学金",
                  "助学金",
                  "困难认定",
                  "优秀学生",
                  "优秀学生干部",
                  "自定义项目",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              年度
              <input name="year" required defaultValue="2026" />
            </label>
            <label>
              学期
              <input name="term" placeholder="2026 秋季学期" />
            </label>
            <label>
              截止时间
              <input name="deadline" type="date" />
            </label>
            <label>
              所需材料
              <input
                name="materials"
                required
                placeholder="申请表、成绩单、事迹材料"
              />
            </label>
          </div>
          <label>
            备注
            <textarea name="notes" />
          </label>
          <button className="primary" type="submit">
            保存项目
          </button>
        </form>
      </details>
      {!!space.awardProjects.length && (
        <>
          <section className="panel award-toolbar">
            <label>
              当前项目
              <select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setSelected([]);
                }}
              >
                {space.awardProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              筛选
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as typeof filter)
                }
              >
                <option value="all">全部候选</option>
                <option value="missing">材料未齐</option>
                <option value="due">7 天内截止</option>
                <option value="unsubmitted">尚未提交</option>
                <option value="passed">已通过</option>
                <option value="failed">未通过</option>
              </select>
            </label>
            <label>
              批量状态
              <select
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value && selected.length)
                    void onBulk(selected, event.target.value as AwardStatus);
                  event.target.value = "";
                }}
              >
                <option value="">选择后批量更新…</option>
                {statuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </section>
          <CandidateForm
            project={activeProject!}
            students={space.students}
            applications={space.awardApplications}
            onAdd={onAddCandidate}
          />
          {!applications.length ? (
            <div className="v2-empty">当前筛选下没有候选记录。</div>
          ) : (
            <section className="award-list">
              {applications.map((application) => {
                const student = space.students.find(
                  (item) => item.id === application.studentId,
                )!;
                const project = space.awardProjects.find(
                  (item) => item.id === application.projectId,
                );
                const toggleMaterial = (material: string) => {
                  const missing = application.missingMaterials.includes(
                    material,
                  )
                    ? application.missingMaterials.filter(
                        (item) => item !== material,
                      )
                    : [...application.missingMaterials, material];
                  void onUpdate(application.id, { missingMaterials: missing });
                };
                return (
                  <article className="panel award-card" key={application.id}>
                    <div className="award-head">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={selected.includes(application.id)}
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? [...selected, application.id]
                                : selected.filter(
                                    (id) => id !== application.id,
                                  ),
                            )
                          }
                        />
                        <span />
                      </label>
                      <div>
                        <button
                          className="link-button student-link"
                          onClick={() => onStudent(student.id)}
                        >
                          {student.name} · {student.studentNo}
                        </button>
                        <p>
                          {project?.name} · 截止{" "}
                          {application.deadline || "未设置"}
                        </p>
                      </div>
                      <label>
                        状态
                        <select
                          value={application.status}
                          onChange={(event) =>
                            void onUpdate(application.id, {
                              status: event.target.value as AwardStatus,
                            })
                          }
                        >
                          {statuses.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="award-body">
                      <div>
                        <b>条件核对</b>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={!!application.eligible}
                            onChange={(event) =>
                              void onUpdate(application.id, {
                                eligible: event.target.checked,
                              })
                            }
                          />
                          标记为符合条件
                        </label>
                      </div>
                      <div>
                        <b>材料清单</b>
                        <div className="material-checks">
                          {application.requiredMaterials.map((material) => (
                            <label className="check" key={material}>
                              <input
                                type="checkbox"
                                checked={
                                  !application.missingMaterials.includes(
                                    material,
                                  )
                                }
                                onChange={() => toggleMaterial(material)}
                              />
                              {material}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <b>缺失材料</b>
                        <p>
                          {application.missingMaterials.join("、") ||
                            "材料齐全"}
                        </p>
                      </div>
                    </div>
                    <details>
                      <summary>结果与备注</summary>
                      <div className="field-grid two">
                        <label>
                          最终结果
                          <input
                            defaultValue={application.result}
                            onBlur={(event) =>
                              void onUpdate(application.id, {
                                result: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          备注
                          <input
                            defaultValue={application.notes}
                            onBlur={(event) =>
                              void onUpdate(application.id, {
                                notes: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </details>
                    <div className="button-row">
                      <button
                        onClick={() => {
                          const draft = generateLocalMaterial(
                            space,
                            application.type.includes("评") ||
                              project?.type.includes("优秀")
                              ? "award-material"
                              : "award-recommendation",
                            student.id,
                          );
                          onGateway({
                            studentId: student.id,
                            title: "AI 帮我整理推荐意见",
                            sourceText: draft.content,
                            purpose: "award",
                            awardApplicationId: application.id,
                          });
                        }}
                      >
                        AI 推荐意见
                      </button>
                      <button
                        onClick={() => {
                          const draft = generateLocalMaterial(
                            space,
                            "award-material",
                            student.id,
                          );
                          onGateway({
                            studentId: student.id,
                            title: "AI 帮我整理事迹材料",
                            sourceText: draft.content,
                            purpose: "award",
                            awardApplicationId: application.id,
                          });
                        }}
                      >
                        AI 事迹材料
                      </button>
                      <button
                        onClick={() => {
                          const draft = generateLocalMaterial(
                            space,
                            "award-recommendation",
                            student.id,
                          );
                          onGateway({
                            studentId: student.id,
                            title: "AI 帮我压缩文字",
                            sourceText: draft.content,
                            purpose: "award",
                            awardApplicationId: application.id,
                          });
                        }}
                      >
                        AI 文字压缩
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}
    </>
  );
}

function CandidateForm({
  project,
  students,
  applications,
  onAdd,
}: {
  project: AwardProject;
  students: StudentRecord[];
  applications: AwardApplication[];
  onAdd: (
    projectId: string,
    studentId: string,
    eligible: boolean,
  ) => Promise<void>;
}) {
  const available = students.filter(
    (student) =>
      !applications.some(
        (item) =>
          item.projectId === project.id && item.studentId === student.id,
      ),
  );
  return (
    <details className="panel candidate-form">
      <summary>＋ 添加候选学生</summary>
      {available.length ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onAdd(
              project.id,
              String(data.get("studentId")),
              data.get("eligible") === "on",
            );
          }}
        >
          <div className="inline-form">
            <label>
              学生
              <select name="studentId">
                {available.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} · {student.studentNo}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input name="eligible" type="checkbox" defaultChecked />
              初步符合条件
            </label>
            <button className="primary" type="submit">
              加入候选
            </button>
          </div>
        </form>
      ) : (
        <p>所有学生都已在候选名单中。</p>
      )}
    </details>
  );
}
