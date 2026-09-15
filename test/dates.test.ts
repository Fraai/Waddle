import { describe, expect, it } from 'vitest';
import { todayISO, splitOverdueAndToday, groupUpcoming } from '../src/lib/dates';
import type { Task } from '../src/lib/db';

function task(overrides: Partial<Task>): Task {
  return {
    id: 1, user_id: 1, project_id: 1, section_id: null, parent_task_id: null,
    title: 'Task', due_date: null, priority: 4, done_at: null, position: 1,
    created_at: '', updated_at: '', ...overrides,
  };
}

describe('todayISO', () => {
  it('formats a date as YYYY-MM-DD in the Europe/Brussels timezone', () => {
    // 2026-01-01T23:30:00Z is 2026-01-02 00:30 CET — a UTC-based "today"
    // would get this wrong, which is exactly the bug this function avoids.
    expect(todayISO(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02');
  });
});

describe('splitOverdueAndToday', () => {
  const today = '2026-06-15';
  it('splits tasks into overdue (before today) and today', () => {
    const tasks = [
      task({ id: 1, due_date: '2026-06-10' }),
      task({ id: 2, due_date: '2026-06-15' }),
      task({ id: 3, due_date: '2026-06-20' }),
      task({ id: 4, due_date: null }),
    ];
    const { overdue, today: dueToday } = splitOverdueAndToday(tasks, today);
    expect(overdue.map((t) => t.id)).toEqual([1]);
    expect(dueToday.map((t) => t.id)).toEqual([2]);
  });
});

describe('groupUpcoming', () => {
  const today = '2026-06-15';
  it('groups future tasks by due date, sorted ascending, excluding today and the past', () => {
    const tasks = [
      task({ id: 1, due_date: '2026-06-20' }),
      task({ id: 2, due_date: '2026-06-18' }),
      task({ id: 3, due_date: '2026-06-20' }),
      task({ id: 4, due_date: '2026-06-15' }),
      task({ id: 5, due_date: '2026-06-10' }),
    ];
    const groups = groupUpcoming(tasks, today);
    expect(groups.map((g) => g.date)).toEqual(['2026-06-18', '2026-06-20']);
    expect(groups[1].tasks.map((t) => t.id)).toEqual([1, 3]);
  });
});
