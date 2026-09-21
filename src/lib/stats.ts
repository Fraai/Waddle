import type { Task } from './db';
import { DEFAULT_TIMEZONE } from './dates';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HEATMAP_DAYS = 371; // 53 full weeks, ending today

// created_at is SQLite's `datetime('now')` ("YYYY-MM-DD HH:MM:SS", UTC, no
// offset marker); done_at is `Date.toISOString()` (already has one). Both
// need to end up parsed as UTC before converting to local time.
function toDate(sqlOrIso: string): Date {
  return /Z|[+-]\d\d:\d\d$/.test(sqlOrIso) ? new Date(sqlOrIso) : new Date(`${sqlOrIso.replace(' ', 'T')}Z`);
}

// 'en-GB' here is fixed on purpose — its weekday output is parsed against
// the hardcoded English WEEKDAY_LABELS above, not shown to anyone, so it
// isn't the DATE_LOCALE display setting the rest of the app follows.
function partsFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  });
}

function localParts(sqlOrIso: string, formatter: Intl.DateTimeFormat): { date: string; hour: number; weekday: string } {
  const parts = Object.fromEntries(formatter.formatToParts(toDate(sqlOrIso)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday };
}

// Date-only arithmetic, mirroring dates.ts's getWeekDates: parse at UTC
// midnight (Workers have no local timezone, so this is unambiguous) and
// re-slice — safe because these are already Brussels-local calendar dates.
function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export interface HeatmapCell {
  date: string;
  count: number;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface ProjectCount {
  projectId: number;
  count: number;
}

export interface TaskStats {
  totalOpen: number;
  totalDone: number;
  completedToday: number;
  completedLast7Days: number;
  completedThisMonth: number;
  currentStreak: number;
  longestStreak: number;
  /** 53 columns (weeks) × 7 rows (Sun..Sat), oldest week first. */
  heatmap: HeatmapCell[][];
  byWeekday: { label: string; count: number }[];
  byHour: { hour: number; count: number }[];
  byProject: ProjectCount[];
  byPriority: { priority: number; count: number }[];
  workVsPrivate: { work: number; private: number };
  onTime: { onTime: number; late: number };
  busiestDay: DayCount | null;
  avgCompletionDays: number | null;
}

export function computeStats(
  tasks: Task[], projectTypeById: Map<number, 'work' | 'private'>, today: string, timezone: string = DEFAULT_TIMEZONE,
): TaskStats {
  const formatter = partsFormatter(timezone);
  const done = tasks.filter((t) => t.done_at !== null);

  const completionsByDate = new Map<string, number>();
  const byWeekdayCount = new Map(WEEKDAY_LABELS.map((l) => [l, 0]));
  const byHourCount = new Map(Array.from({ length: 24 }, (_, h) => [h, 0]));
  const byProjectCount = new Map<number, number>();
  const byPriorityCount = new Map([1, 2, 3, 4].map((p) => [p, 0]));
  const workVsPrivate = { work: 0, private: 0 };
  const onTime = { onTime: 0, late: 0 };
  let completionDaySum = 0;

  for (const task of done) {
    const { date, hour, weekday } = localParts(task.done_at!, formatter);
    completionsByDate.set(date, (completionsByDate.get(date) ?? 0) + 1);
    byWeekdayCount.set(weekday, (byWeekdayCount.get(weekday) ?? 0) + 1);
    byHourCount.set(hour, (byHourCount.get(hour) ?? 0) + 1);
    byProjectCount.set(task.project_id, (byProjectCount.get(task.project_id) ?? 0) + 1);
    byPriorityCount.set(task.priority, (byPriorityCount.get(task.priority) ?? 0) + 1);

    const type = projectTypeById.get(task.project_id) ?? 'work';
    workVsPrivate[type] += 1;

    if (task.due_date !== null) {
      if (date <= task.due_date) onTime.onTime += 1;
      else onTime.late += 1;
    }

    completionDaySum += Math.max(0, Math.round(
      (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${localParts(task.created_at, formatter).date}T00:00:00Z`).getTime())
      / 86_400_000,
    ));
  }

  let busiestDay: DayCount | null = null;
  for (const [date, count] of completionsByDate) {
    if (!busiestDay || count > busiestDay.count) busiestDay = { date, count };
  }

  const activeDates = [...completionsByDate.keys()].sort();
  let longestStreak = 0;
  let run = 0;
  for (let i = 0; i < activeDates.length; i++) {
    run = i > 0 && addDays(activeDates[i - 1], 1) === activeDates[i] ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }
  let currentStreak = 0;
  let cursor = completionsByDate.has(today) ? today : addDays(today, -1);
  while (completionsByDate.has(cursor)) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  let completedLast7Days = 0;
  for (let i = 0; i < 7; i++) completedLast7Days += completionsByDate.get(addDays(today, -i)) ?? 0;

  const thisMonthPrefix = today.slice(0, 7);
  let completedThisMonth = 0;
  for (const [date, count] of completionsByDate) if (date.startsWith(thisMonthPrefix)) completedThisMonth += count;

  // Grid starts on the Sunday on/before (today - 52 weeks), so it always
  // ends with the current, possibly-partial week.
  const todayWeekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0=Sun
  const gridStart = addDays(today, -(HEATMAP_DAYS - 1 - todayWeekday));
  const heatmap: HeatmapCell[][] = [];
  for (let week = 0; week < 53; week++) {
    const column: HeatmapCell[] = [];
    for (let day = 0; day < 7; day++) {
      const date = addDays(gridStart, week * 7 + day);
      if (date > today) break;
      column.push({ date, count: completionsByDate.get(date) ?? 0 });
    }
    if (column.length > 0) heatmap.push(column);
  }

  return {
    totalOpen: tasks.length - done.length,
    totalDone: done.length,
    completedToday: completionsByDate.get(today) ?? 0,
    completedLast7Days,
    completedThisMonth,
    currentStreak,
    longestStreak,
    heatmap,
    byWeekday: WEEKDAY_LABELS.map((label) => ({ label, count: byWeekdayCount.get(label) ?? 0 })),
    byHour: [...byHourCount].map(([hour, count]) => ({ hour, count })),
    byProject: [...byProjectCount].map(([projectId, count]) => ({ projectId, count })).sort((a, b) => b.count - a.count),
    byPriority: [...byPriorityCount].map(([priority, count]) => ({ priority, count })),
    workVsPrivate,
    onTime,
    busiestDay,
    avgCompletionDays: done.length > 0 ? completionDaySum / done.length : null,
  };
}
