import { useEffect, useMemo, useState } from "react";
import { copyText } from "./desktop";
import {
  downloadText,
  generateLocalMaterial,
  materialTypeLabels,
  type GeneratedMaterial,
  type MaterialType,
} from "./materials";
import type { V2Space } from "./types";

export function MaterialsPane({
  space,
  initialStudentId,
  onArchive,
  onPolish,
}: {
  space: V2Space;
  initialStudentId?: string;
  onArchive: (draft: GeneratedMaterial) => Promise<void>;
  /** 打开 AI 润色弹窗：对生成出来的材料润色，结果可复制、导出或归档。 */
  onPolish: (preview: GeneratedMaterial) => void;
}) {
  const [type, setType] = useState<MaterialType>("conversation");
  const [studentId, setStudentId] = useState(
    initialStudentId ?? space.students[0]?.id ?? "",
  );
  const [preview, setPreview] = useState<GeneratedMaterial>();
  const [copied, setCopied] = useState(false);
  const [actionNote, setActionNote] = useState("");
  const needsStudent = type !== "class-summary";
  const relevantStudents = useMemo(
    () =>
      space.students.filter((student) => {
        if (["conversation", "student-system"].includes(type))
          return space.conversations.some(
            (item) => item.studentId === student.id,
          );
        if (type === "absence")
          return space.events.some(
            (item) =>
              item.studentId === student.id &&
              ["缺勤", "迟到", "请假异常"].includes(item.type),
          );
        if (type === "academic")
          return space.events.some(
            (item) =>
              item.studentId === student.id &&
              ["挂科", "成绩下降", "学习困难"].includes(item.type),
          );
        if (["award-recommendation", "award-material"].includes(type))
          return space.awardApplications.some(
            (item) => item.studentId === student.id,
          );
        if (["employment", "upgrade"].includes(type))
          return space.careerPlans.some(
            (item) => item.studentId === student.id,
          );
        return true;
      }),
    [space, type],
  );
  useEffect(() => {
    if (!needsStudent) return;
    if (!relevantStudents.some((student) => student.id === studentId))
      setStudentId(relevantStudents[0]?.id ?? "");
  }, [needsStudent, relevantStudents, studentId]);
  return (
    <>
      <div className="v2-page-title">
        <div>
          <span>材料输出</span>
          <h1>已经记录过一次，不再重新写第二遍</h1>
          <p>本地模板直接复用事件、谈话、待办和跟进结果。</p>
        </div>
      </div>
      <section className="material-layout">
        <article className="panel material-builder">
          <h2>选择输出</h2>
          <label>
            材料类型
            <select
              value={type}
              onChange={(event) => {
                const next = event.target.value as MaterialType;
                setType(next);
                setPreview(undefined);
                setCopied(false);
                setActionNote("");
              }}
            >
              {Object.entries(materialTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {needsStudent && (
            <>
              <label>
                学生
                <select
                  value={studentId}
                  disabled={!relevantStudents.length}
                  onChange={(event) => {
                    setStudentId(event.target.value);
                    setPreview(undefined);
                  }}
                >
                  {relevantStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} · {student.studentNo}
                    </option>
                  ))}
                </select>
              </label>
              {!relevantStudents.length && (
                <p className="form-hint">
                  当前还没有可用于该材料的本地记录，请先完成对应事务或谈话。
                </p>
              )}
            </>
          )}
          <p className="privacy-note">
            材料生成在本地完成，不依赖网络；生成后如需「AI
            润色」，会先在弹窗里脱敏，AI 只会看到去标识化后的内容。
          </p>
          <button
            className="primary"
            disabled={needsStudent && !studentId}
            onClick={() => {
              try {
                setPreview(
                  generateLocalMaterial(
                    space,
                    type,
                    needsStudent ? studentId : undefined,
                  ),
                );
                setCopied(false);
                setActionNote("");
              } catch {
                setPreview(undefined);
              }
            }}
          >
            生成材料
          </button>
        </article>
        <article className="panel material-preview">
          <div className="section-title">
            <div>
              <h2>输出预览</h2>
              <p>
                {preview
                  ? `${preview.sourceEventIds.length} 个事件 · ${preview.sourceConversationIds.length} 次谈话`
                  : "选择材料后生成"}
              </p>
            </div>
          </div>
          {preview ? (
            <>
              <textarea
                aria-label="材料输出预览"
                value={preview.content}
                onChange={(event) =>
                  setPreview({ ...preview, content: event.target.value })
                }
              />
              <div className="button-row">
                <button
                  onClick={async () => {
                    const ok = await copyText(preview.content);
                    if (ok) {
                      setCopied(true);
                      setActionNote("");
                    } else {
                      setActionNote("复制失败，请点开预览框手动全选复制。");
                    }
                  }}
                >
                  {copied ? "已复制" : "一键复制"}
                </button>
                <button
                  onClick={async () => {
                    const path = await downloadText(
                      preview.title,
                      preview.content,
                    );
                    setActionNote(
                      path
                        ? `已保存到下载文件夹：${path.split(/[\\/]/).pop()}`
                        : "",
                    );
                  }}
                >
                  导出 TXT
                </button>
                <button onClick={() => void onArchive(preview)}>
                  保存到本地归档
                </button>
                <button onClick={() => onPolish(preview)}>AI 润色</button>
              </div>
              {actionNote && (
                <p className="template-hint" role="status">
                  {actionNote}
                </p>
              )}
            </>
          ) : (
            <div className="v2-empty">尚未生成材料。</div>
          )}
        </article>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>本地归档</h2>
            <p>{space.materialArchives.length} 份已保存材料</p>
          </div>
        </div>
        {space.materialArchives.length ? (
          <div className="archive-list">
            {space.materialArchives.map((item) => (
              <details key={item.id}>
                <summary>
                  {item.title}
                  <small>
                    {item.createdAt.slice(0, 10)} ·{" "}
                    {item.aiUsed ? "AI 优化后人工审核" : "本地模板"}
                  </small>
                </summary>
                <pre>{item.content}</pre>
              </details>
            ))}
          </div>
        ) : (
          <div className="v2-empty">保存后的材料会出现在这里。</div>
        )}
      </section>
    </>
  );
}
