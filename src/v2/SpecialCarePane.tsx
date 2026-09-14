import { useMemo, useState } from "react";
import { studentTaskCount } from "./selectors";
import type { StudentRecord, V2Space } from "./types";

const careFilters = [
  "家庭经济 / 家庭变故",
  "心理状态关注",
  "学业困难",
  "升学就业长期无进展",
  "其他",
  "多重关注",
] as const;

function matchesCareType(student: StudentRecord, filter: string) {
  const values = student.careTypes ?? [];
  const text = values.join(" ");
  if (filter === "多重关注") return values.length > 1;
  if (filter === "家庭经济 / 家庭变故") return /家庭|经济|困难|变故/.test(text);
  if (filter === "心理状态关注") return /心理|情绪|状态/.test(text);
  if (filter === "学业困难") return /学业|学习|成绩|挂科/.test(text);
  if (filter === "升学就业长期无进展") return /升学|就业|专升本|去向/.test(text);
  return values.length === 0 || values.some((value) => !/家庭|经济|困难|变故|心理|情绪|状态|学业|学习|成绩|挂科|升学|就业|专升本|去向/.test(value));
}

export function latestAcademic(space: V2Space, studentId: string) {
  return space.academicRecords
    .filter((item) => item.studentId === studentId)
    .sort((a, b) => a.importedAt.localeCompare(b.importedAt))
    .at(-1);
}

export function SpecialCarePane({
  space,
  onStudent,
  onTalk,
  onTask,
  onEvent,
}: {
  space: V2Space;
  onStudent: (id: string) => void;
  onTalk: (student: StudentRecord) => Promise<void>;
  onTask: (student: StudentRecord) => Promise<void>;
  onEvent: (studentId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [careType, setCareType] = useState("");
  const [status, setStatus] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [sort, setSort] = useState("studentNo");
  const students = useMemo(() => {
    const result = space.students.filter((student) => {
      if (!student.specialCare) return false;
      const academic = latestAcademic(space, student.id);
      return (!query.trim() || `${student.name} ${student.studentNo} ${(student.careTypes ?? []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())) &&
        (!careType || matchesCareType(student, careType)) &&
        (!status || student.status === status) &&
        (!failedOnly || (academic?.failedCount ?? 0) > 0 || academic?.failed);
    });
    return result.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (sort === "tasks") return (studentTaskCount(space.tasks, b.id) + (b.importedTaskCount ?? 0)) - (studentTaskCount(space.tasks, a.id) + (a.importedTaskCount ?? 0));
      if (sort === "rank") return (latestAcademic(space, a.id)?.rank ?? 99999) - (latestAcademic(space, b.id)?.rank ?? 99999);
      return a.studentNo.localeCompare(b.studentNo);
    });
  }, [space, query, careType, status, failedOnly, sort]);

  return <>
    <div className="v2-page-title">
      <div>
        <span>人工管理状态 · 本地完整可见</span>
        <h1>特殊关爱学生目录</h1>
        <p>共 {space.students.filter((student) => student.specialCare).length} 人；宗教信仰和性取向不会触发该状态。</p>
      </div>
    </div>
    <section className="panel care-directory">
      <div className="care-filters">
        <label>搜索<input aria-label="搜索特殊关爱学生" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名 / 学号 / 关爱类型" /></label>
        <label>关爱类型<select aria-label="特殊关爱类型筛选" value={careType} onChange={(event) => setCareType(event.target.value)}><option value="">全部类型</option>{careFilters.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>当前状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{[...new Set(space.students.map((student) => student.status))].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>排序<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="studentNo">按学号</option><option value="name">按姓名</option><option value="tasks">待办从多到少</option><option value="rank">最近排名</option></select></label>
        <label className="check care-check"><input type="checkbox" checked={failedOnly} onChange={(event) => setFailedOnly(event.target.checked)} />仅看挂科</label>
      </div>
      <p>当前显示 {students.length} 人</p>
      <div className="table-scroll">
        <table className="v2-table care-table">
          <thead><tr><th>姓名 / 学号</th><th>状态</th><th>特殊关爱类型</th><th>最近谈话</th><th>待办</th><th>最近成绩</th><th>最近排名</th><th>挂科</th><th>下一步事项</th><th>操作</th></tr></thead>
          <tbody>{students.map((student) => {
            const academic = latestAcademic(space, student.id);
            const actualTasks = space.tasks.filter((task) => task.studentId === student.id && task.status === "待处理");
            const conversation = space.conversations.filter((item) => item.studentId === student.id).sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))[0];
            return <tr key={student.id}>
              <td><button className="link-button care-student" onClick={() => onStudent(student.id)}><b>{student.name}</b><small>{student.studentNo}</small></button></td>
              <td><span className={`status status-${student.status}`}>{student.status}</span></td>
              <td><div className="tag-row">{(student.careTypes?.length ? student.careTypes : ["待补充类型"]).map((item) => <span key={item}>{item}</span>)}</div>{(student.careTypes?.length ?? 0) > 1 && <small>多重关注</small>}</td>
              <td>{conversation?.happenedAt ?? student.importedLastTalkDate ?? "—"}</td>
              <td>{actualTasks.length + (student.importedTaskCount ?? 0)}</td>
              <td>{academic?.score ?? "—"}</td><td>{academic?.rank ?? "—"}</td><td>{academic?.failedCount ?? (academic?.failed ? 1 : 0)} 门</td>
              <td>{actualTasks[0]?.title ?? (student.importedTaskCount ? "查看导入待办快照" : "登记后续处理计划")}</td>
              <td><div className="care-actions"><button onClick={() => onStudent(student.id)}>详情</button><button onClick={() => void onTalk(student)}>发起谈话</button><button onClick={() => void onTask(student)}>建待办</button><button onClick={() => onEvent(student.id)}>登记事件</button></div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  </>;
}
