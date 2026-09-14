import { useEffect, useState } from "react";
import {
  todayAgenda,
  todayProgress,
  upcomingTasks,
  weekRhythm,
  type AgendaKind,
} from "./selectors";
import type { TaskRecord, V2Space } from "./types";

const WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

const MAX_VISIBLE = 5;

const pad = (value: number) => String(value).padStart(2, "0");

const isoDay = () => new Date().toISOString().slice(0, 10);

function greeting(hour: number) {
  if (hour < 6) return "夜深了，注意休息。";
  if (hour < 9) return "早上好，先看今天要办的事。";
  if (hour < 12) return "上午好。";
  if (hour < 14) return "中午好，记得休息。";
  if (hour < 18) return "下午好。";
  return "晚上好，收尾一下今天的事。";
}

function personName(space: V2Space, id?: string) {
  return (
    space.students.find((student) => student.id === id)?.name ?? "未关联学生"
  );
}

const kindLabels: Record<AgendaKind, string> = {
  overdue: "已逾期",
  today: "今天到期",
  talk: "待谈话",
};

/**
 * 时钟单独成组件：每秒的状态更新只重渲染这一小块，不影响清单与看板。
 */
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(() => new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const hour = now.getHours();
  return (
    <article className="panel today-clock">
      <span className="today-clock-label">现在</span>
      <time
        className="today-clock-time"
        dateTime={`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
          now.getDate(),
        )}T${pad(hour)}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`}
      >
        <b>
          {pad(hour)}:{pad(now.getMinutes())}
        </b>
        <i>:{pad(now.getSeconds())}</i>
      </time>
      <p className="today-clock-date">
        {now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日
        <span>{WEEKDAYS[now.getDay()]}</span>
      </p>
      <span className="today-clock-greeting">{greeting(hour)}</span>
    </article>
  );
}

const shortDate = (value?: string) => {
  if (!value) return "";
  const [, month, dayPart] = value.split("-");
  return `${Number(month)}/${Number(dayPart)}`;
};

/**
 * 「今日推进 / 本周节奏 / 接下来」——把时钟下方的时间语境补全：
 * 现在（时钟）→ 今天（推进）→ 本周（节奏）→ 接下来（前瞻）。
 * 全部由本机 tasks 派生：不新增存储、不联网、不产生新的数据通道。
 */
function Rhythm({
  space,
  onStudent,
}: {
  space: V2Space;
  onStudent: (id: string) => void;
}) {
  const today = isoDay();
  const { done, open, total } = todayProgress(space, today);
  const week = weekRhythm(space, today);
  const upcoming = upcomingTasks(space, today, 3);
  const segments = total === 0 ? 0 : Math.min(total, 12);
  const filled =
    total === 0 ? 0 : total <= 12 ? done : Math.round((done / total) * 12);

  return (
    <section className="panel today-rhythm">
      <div className="today-rhythm-block">
        <span className="today-rhythm-label">今日推进</span>
        <div className="today-progress-head">
          <span className="today-progress-num">
            {done}
            <span className="today-progress-total">/ {total}</span>
          </span>
          <span className="today-progress-note">
            {open > 0 ? `还剩 ${open} 项` : "今天的都办完了"}
          </span>
        </div>
        {total > 0 ? (
          <div
            className="today-progress-bar"
            role="progressbar"
            aria-label="今日推进"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            {Array.from({ length: segments }, (_, index) => (
              <span key={index} className={index < filled ? "filled" : ""} />
            ))}
          </div>
        ) : (
          <p className="today-progress-none">今天没有需要推进的事项。</p>
        )}
      </div>

      <div className="today-rhythm-block">
        <span className="today-rhythm-label">本周节奏</span>
        <ol className="today-week">
          {week.map((dayItem) => (
            <li
              key={dayItem.key}
              className={[
                dayItem.isToday ? "is-today" : "",
                dayItem.count > 0 ? "has-items" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={`${dayItem.date} 日，星期${dayItem.weekday}，${dayItem.count} 项待办`}
            >
              <span className="today-week-wd">{dayItem.weekday}</span>
              <span className="today-week-date">{dayItem.date}</span>
              <span className="today-week-dot" aria-hidden="true" />
            </li>
          ))}
        </ol>
      </div>

      {upcoming.length > 0 && (
        <div className="today-rhythm-block">
          <span className="today-rhythm-label">接下来</span>
          <ul className="today-upcoming">
            {upcoming.map((task) => (
              <li key={task.id}>
                <button
                  onClick={() => {
                    if (task.studentId) onStudent(task.studentId);
                  }}
                >
                  <span className="today-upcoming-date">
                    {shortDate(task.dueAt)}
                  </span>
                  <span className="today-upcoming-title">
                    <b>{personName(space, task.studentId)}</b>
                    {task.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function TodayBoard({
  space,
  onOpenTasks,
  onOpenTalks,
  onStudent,
  onComplete,
}: {
  space: V2Space;
  onOpenTasks: () => void;
  onOpenTalks: () => void;
  onStudent: (id: string) => void;
  onComplete: (task: TaskRecord) => Promise<void>;
}) {
  const { entries, counts } = todayAgenda(space, isoDay());
  const [busyId, setBusyId] = useState<string>();
  const visible = entries.slice(0, MAX_VISIBLE);
  const rest = entries.length - visible.length;

  async function complete(task: TaskRecord) {
    setBusyId(task.id);
    try {
      await onComplete(task);
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="today-board">
      <div className="today-rail">
        <Clock />
        <Rhythm space={space} onStudent={onStudent} />
      </div>
      <article className="panel today-list">
        <div className="section-title">
          <div>
            <h2>今日待办清单</h2>
            <p>只列今天到期、已逾期和待谈话的事项</p>
          </div>
          <button onClick={onOpenTasks}>打开待办中心 →</button>
        </div>
        <div className="today-summary">
          <button className="today-chip overdue" onClick={onOpenTasks}>
            已逾期
            <strong>{counts.overdue}</strong>
          </button>
          <button className="today-chip today" onClick={onOpenTasks}>
            今天到期
            <strong>{counts.dueToday}</strong>
          </button>
          <button className="today-chip talk" onClick={onOpenTalks}>
            待谈话
            <strong>{counts.talk}</strong>
          </button>
        </div>
        {visible.length ? (
          <ul className="today-items">
            {visible.map(({ task, kind }) => (
              <li className={`today-item ${kind}`} key={task.id}>
                <button
                  className="today-check"
                  aria-label={`标记完成：${task.title}`}
                  disabled={busyId === task.id}
                  onClick={() => void complete(task)}
                >
                  <span aria-hidden="true">
                    {busyId === task.id ? "…" : "✓"}
                  </span>
                </button>
                <button
                  className="today-item-main"
                  onClick={() => {
                    if (task.studentId) onStudent(task.studentId);
                  }}
                >
                  <span className="today-item-title">
                    <b>{personName(space, task.studentId)}</b>
                    {task.title}
                  </span>
                  <small>
                    <span className={`today-kind ${kind}`}>
                      {kindLabels[kind]}
                    </span>
                    <span className={`priority ${task.priority}`}>
                      {task.priority === "high"
                        ? "急"
                        : task.priority === "medium"
                          ? "中"
                          : "缓"}
                    </span>
                    {task.dueAt && kind !== "talk" ? (
                      <span className="today-due">截止 {task.dueAt}</span>
                    ) : null}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="today-empty">
            今天没有到期事项。新登记的事件会自动生成待办。
          </p>
        )}
        {rest > 0 && (
          <button className="today-more" onClick={onOpenTasks}>
            还有 {rest} 项，打开待办中心 →
          </button>
        )}
      </article>
    </section>
  );
}
