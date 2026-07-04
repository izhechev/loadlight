// Duplicate-task detection for the Settings cleanup tool. Old bugs (double
// saves, repeated extraction tests) left many identical copies; this groups
// them so the user can delete extras in one click.

export interface DupTask {
  id: string
  name: string
  category?: string | null
  deadline?: string | null
  done?: boolean
  recurring?: string | null
  createdAt?: string | number | null
}

export interface DuplicateGroup<T extends DupTask> {
  /** Display label for the group (cleaned task name). */
  label: string
  /** All members, keep first. */
  tasks: T[]
  /** The copy worth keeping (most information, oldest as tiebreak). */
  keep: T
  /** Everything else — safe to delete. */
  duplicates: T[]
}

/** Lowercase, strip inline time tokens and stray punctuation, collapse spaces. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\d{1,2}[:;]\d{2}\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Time-of-day portion of a deadline ("10:30") or '' — different dose times stay separate. */
function timeKey(deadline: string | null | undefined): string {
  if (!deadline) return ''
  const n = deadline.replace(' ', 'T')
  if (!n.includes('T')) return ''
  return n.split('T')[1].slice(0, 5)
}

/** Rough "how much information does this copy carry" score for choosing the keeper. */
function richness(t: DupTask): number {
  let score = 0
  if (t.recurring && t.recurring !== 'none') score += 4
  if (t.deadline) score += 2
  if (t.category && t.category.toLowerCase() !== 'personal') score += 1
  return score
}

export function findDuplicateGroups<T extends DupTask>(tasks: T[]): DuplicateGroup<T>[] {
  const byKey = new Map<string, T[]>()
  for (const t of tasks) {
    if (t.done) continue
    const norm = normalizeName(t.name ?? '')
    if (!norm) continue
    const key = `${norm}|${(t.category ?? '').toLowerCase()}|${timeKey(t.deadline)}`
    byKey.set(key, [...(byKey.get(key) ?? []), t])
  }
  const groups: DuplicateGroup<T>[] = []
  for (const members of byKey.values()) {
    if (members.length < 2) continue
    const sorted = [...members].sort((a, b) => {
      const r = richness(b) - richness(a)
      if (r !== 0) return r
      return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
    })
    groups.push({
      label: sorted[0].name,
      tasks: sorted,
      keep: sorted[0],
      duplicates: sorted.slice(1),
    })
  }
  return groups.sort((a, b) => b.duplicates.length - a.duplicates.length)
}
