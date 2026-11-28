"use client";

import { useState } from "react";
import { ClassicIcon } from "@/lib/classic-icons";
import styles from "./home-preview.module.css";

const tasks = [
  { id: "report", title: "Work on the lab report", minutes: 60, icon: "study" },
  { id: "groceries", title: "Buy groceries", minutes: 25, icon: "personal" },
  { id: "call", title: "Call Mum", minutes: 10, icon: "other" },
] as const;

type TaskId = (typeof tasks)[number]["id"];
const totalMinutes = tasks.reduce((total, task) => total + task.minutes, 0);

export default function HomePreview() {
  const [completed, setCompleted] = useState<Partial<Record<TaskId, boolean>>>({});
  const remaining = tasks.filter(({ id }) => !completed[id]);
  const minutesLeft = remaining.reduce((total, task) => total + task.minutes, 0);

  return (
    <section id="example-plan" className={styles.sheet} aria-labelledby="example-plan-title" tabIndex={-1}>
      <header className={styles.titleBar}>
        <ClassicIcon name="tasks" size={21} />
        <h2 id="example-plan-title">Example plan</h2>
      </header>
      <div className={styles.plan}>
        <div className={styles.note}>
          <p className={styles.noteTitle}>Original note</p>
          <p>Spend 60 min on the lab report, 25 min getting groceries, and 10 min calling Mum.</p>
        </div>
        <fieldset className={styles.tasks}>
          <legend>Check off a task</legend>
          <div className={styles.rows}>
            {tasks.map(({ id, title, minutes, icon }) => (
              <label key={id} className={styles.row}>
                <input
                  type="checkbox"
                  aria-label={title}
                  aria-describedby={`preview-minutes-${id}`}
                  checked={completed[id] ?? false}
                  onChange={(event) => {
                    const { checked } = event.currentTarget;
                    setCompleted((previous) => ({ ...previous, [id]: checked }));
                  }}
                />
                <ClassicIcon name={icon} size={19} />
                <span className={styles.taskName}>{title}</span>
                <span id={`preview-minutes-${id}`} className={styles.duration}>{minutes} min</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className={styles.workload}>
          <output className={styles.summary} aria-live="polite" aria-atomic="true">
            <span>
              {remaining.length === 0
                ? "All tasks done"
                : `${remaining.length} ${remaining.length === 1 ? "task" : "tasks"} left`}
            </span>
            <strong>{minutesLeft} min left</strong>
          </output>
          <meter className={styles.meter} min={0} max={totalMinutes} value={minutesLeft} aria-label="Time left in the example plan" />
        </div>
      </div>
    </section>
  );
}
