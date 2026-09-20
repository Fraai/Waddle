import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/lib/stats';
import type { Task } from '../src/lib/db';

function task(overrides: Partial<Task>): Task {
  return {
    id: 1, user_id: 1, project_id: 1, section_id: null, parent_task_id: null,
    title: 'Task', description: null, href: null, due_date: null, due_time: null,
    priority: 4, repeat_rule: null, notified_at: null, done_at: null, position: 1,
    created_at: '2026-06-01 09:00:00', updated_at: '2026-06-01 09:00:00', ...overrides,
  };
}

const projectTypes = new Map<number, 'work' | 'private'>([[1, 'work'], [2, 'private']]);

describe('computeStats', () => {
  it('splits open vs done', () => {
    const stats = computeStats([
      task({ id: 1, done_at: null }),
      task({ id: 2, done_at: '2026-06-15T10:00:00.000Z' }),
    ], projectTypes, '2026-06-15');
    expect(stats.totalOpen).toBe(1);
    expect(stats.totalDone).toBe(1);
  });

  it('buckets completions into the Brussels-local calendar day, not the UTC one', () => {
    // 23:30 UTC on 2026-06-14 is 01:30 CEST on 2026-06-15.
    const stats = computeStats([
      task({ id: 1, done_at: '2026-06-14T23:30:00.000Z' }),
    ], projectTypes, '2026-06-15');
    expect(stats.completedToday).toBe(1);
  });

  it('computes current and longest streaks from consecutive completion days', () => {
    const stats = computeStats([
      task({ id: 1, done_at: '2026-06-10T10:00:00.000Z' }),
      task({ id: 2, done_at: '2026-06-11T10:00:00.000Z' }),
      task({ id: 3, done_at: '2026-06-12T10:00:00.000Z' }),
      // gap
      task({ id: 4, done_at: '2026-06-14T10:00:00.000Z' }),
      task({ id: 5, done_at: '2026-06-15T10:00:00.000Z' }),
    ], projectTypes, '2026-06-15');
    expect(stats.longestStreak).toBe(3);
    expect(stats.currentStreak).toBe(2);
  });

  it('keeps a streak alive if today has no completion yet but yesterday did', () => {
    const stats = computeStats([
      task({ id: 1, done_at: '2026-06-14T10:00:00.000Z' }),
    ], projectTypes, '2026-06-15');
    expect(stats.currentStreak).toBe(1);
  });

  it('breaks the streak once yesterday is also empty', () => {
    const stats = computeStats([
      task({ id: 1, done_at: '2026-06-10T10:00:00.000Z' }),
    ], projectTypes, '2026-06-15');
    expect(stats.currentStreak).toBe(0);
  });

  it('classifies on-time vs late against the local completion date', () => {
    const stats = computeStats([
      task({ id: 1, due_date: '2026-06-15', done_at: '2026-06-15T10:00:00.000Z' }),
      task({ id: 2, due_date: '2026-06-10', done_at: '2026-06-15T10:00:00.000Z' }),
      task({ id: 3, due_date: null, done_at: '2026-06-15T10:00:00.000Z' }),
    ], projectTypes, '2026-06-15');
    expect(stats.onTime).toEqual({ onTime: 1, late: 1 });
  });

  it('splits work vs private by the task\'s project type', () => {
    const stats = computeStats([
      task({ id: 1, project_id: 1, done_at: '2026-06-15T10:00:00.000Z' }),
      task({ id: 2, project_id: 2, done_at: '2026-06-15T10:00:00.000Z' }),
    ], projectTypes, '2026-06-15');
    expect(stats.workVsPrivate).toEqual({ work: 1, private: 1 });
  });

  it('finds the busiest day across all completions', () => {
    const stats = computeStats([
      task({ id: 1, done_at: '2026-06-10T10:00:00.000Z' }),
      task({ id: 2, done_at: '2026-06-12T10:00:00.000Z' }),
      task({ id: 3, done_at: '2026-06-12T11:00:00.000Z' }),
    ], projectTypes, '2026-06-15');
    expect(stats.busiestDay).toEqual({ date: '2026-06-12', count: 2 });
  });

  it('averages days from creation to completion', () => {
    const stats = computeStats([
      task({ id: 1, created_at: '2026-06-10 09:00:00', done_at: '2026-06-15T10:00:00.000Z' }), // 5 days
      task({ id: 2, created_at: '2026-06-15 09:00:00', done_at: '2026-06-15T10:00:00.000Z' }), // 0 days
    ], projectTypes, '2026-06-15');
    expect(stats.avgCompletionDays).toBe(2.5);
  });

  it('builds a 53-week heatmap grid ending on today, filling zero-count days', () => {
    const stats = computeStats([
      task({ id: 1, done_at: '2026-06-15T10:00:00.000Z' }),
    ], projectTypes, '2026-06-15');
    const lastWeek = stats.heatmap[stats.heatmap.length - 1];
    const todayCell = lastWeek[lastWeek.length - 1];
    expect(todayCell).toEqual({ date: '2026-06-15', count: 1 });
    expect(stats.heatmap.flat().filter((c) => c.count === 0).length).toBeGreaterThan(300);
  });

  it('returns null completion-day average and no busiest day with nothing done', () => {
    const stats = computeStats([task({ id: 1, done_at: null })], projectTypes, '2026-06-15');
    expect(stats.avgCompletionDays).toBeNull();
    expect(stats.busiestDay).toBeNull();
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
  });
});
