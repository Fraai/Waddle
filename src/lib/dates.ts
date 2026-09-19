import type { Task } from './db';

// Uses the fixed Europe/Brussels timezone rather than the Worker's UTC
// clock, so "today" matches what a Belgium-based user actually sees, even
// right after midnight UTC.
export function todayISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(date);
}

export interface TodayGroups {
  overdue: Task[];
  today: Task[];
}

export function splitOverdueAndToday(tasks: Task[], today: string): TodayGroups {
  return {
    overdue: tasks.filter((t) => t.due_date !== null && t.due_date < today),
    today: tasks.filter((t) => t.due_date === today),
  };
}

export interface UpcomingGroup {
  date: string;
  tasks: Task[];
}

export function groupUpcoming(tasks: Task[], today: string): UpcomingGroup[] {
  const byDate = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.due_date === null || task.due_date <= today) continue;
    const group = byDate.get(task.due_date);
    if (group) group.push(task);
    else byDate.set(task.due_date, [task]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateTasks]) => ({ date, tasks: dateTasks }));
}

// Rolling, not calendar-anchored — always starts today, unlike a Mon-Sun
// week — so it reads the same regardless of which day you open it.
export function getWeekDates(today: string): string[] {
  const start = new Date(`${today}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export interface WeekDay {
  date: string;
  tasks: Task[];
}

// Every date in the window gets an entry — even with zero tasks — so the
// week view always has 7 columns to drag into, not just the days that
// happen to already have something due.
export function groupWeek(tasks: Task[], weekDates: string[]): WeekDay[] {
  const byDate = new Map<string, Task[]>(weekDates.map((d) => [d, []]));
  for (const task of tasks) {
    if (task.due_date === null) continue;
    byDate.get(task.due_date)?.push(task);
  }
  return weekDates.map((date) => ({ date, tasks: byDate.get(date)! }));
}
