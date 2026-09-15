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
