"use client";

import { useState } from "react";
import styles from "./home-preview.module.css";

const tasks = [
  { id: "report", title: "Work on the lab report", minutes: 60 },
  { id: "groceries", title: "Buy groceries", minutes: 25 },
  { id: "call", title: "Call Mum", minutes: 10 },
] as const;

type TaskId = (typeof tasks)[number]["id"];

export default function HomePreview() {
  const [completed, setCompleted] = useState<Partial<Record<TaskId, boolean>>>({});
  const remaining = tasks.filter(({ id }) => !completed[id]);
  const minutesLeft = remaining.reduce((total, task) => total + task.minutes, 0);

  return (
    <section className={styles.sheet} aria-labelledby="example-plan-title">
      <h2 id="example-plan-title" className={styles.title}>
        Example plan
      </h2>
      <p className={styles.note}>
        Spend 60 min on the lab report, 25 min getting groceries, and 10 min calling Mum.
      </p>
      <fieldset className={styles.tasks}>
        <legend className={styles.legend}>Check off a task</legend>
        {tasks.map(({ id, title, minutes }) => (
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
            <span className={styles.taskName}>{title}</span>
            <span id={`preview-minutes-${id}`} className={styles.duration}>
              {minutes} min
            </span>
          </label>
        ))}
      </fieldset>
      <output className={styles.summary} aria-live="polite" aria-atomic="true">
        <span>
          {remaining.length === 0
            ? "All tasks done"
            : `${remaining.length} ${remaining.length === 1 ? "task" : "tasks"} left`}
        </span>
        <strong>{minutesLeft} min left</strong>
      </output>
    </section>
  );
}
