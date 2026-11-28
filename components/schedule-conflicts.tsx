export function ScheduleConflicts({ conflicts }: { conflicts?: string[] }) {
  if (!conflicts?.length) return null
  return (
    <section aria-label="Schedule conflicts" className="aero-warning rounded-2xl p-3.5">
      <h3 className="text-sm font-bold mb-1">Schedule conflicts</h3>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {conflicts.map((message, index) => <li key={index}>{message}</li>)}
      </ul>
    </section>
  )
}
