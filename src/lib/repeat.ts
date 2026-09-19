// Simple interval repeat — no separate recurring-series concept. A task
// carries its own repeat_rule; completing one (with a due date) spawns the
// next occurrence as an ordinary new task with the same rule copied onto
// it. Undoing a completion, deleting an occurrence, or editing one doesn't
// touch any other occurrence — they're independent from the moment they're
// created.
export const CUSTOM_REPEAT_RE = /^every:([1-9][0-9]*):days$/;

export function isValidRepeatRule(value: string): boolean {
  return value === 'daily' || value === 'weekly' || value === 'monthly' || CUSTOM_REPEAT_RE.test(value);
}

export function repeatRuleLabel(rule: string): string {
  if (rule === 'daily') return 'Daily';
  if (rule === 'weekly') return 'Weekly';
  if (rule === 'monthly') return 'Monthly';
  const match = rule.match(CUSTOM_REPEAT_RE);
  if (match) return `Every ${match[1]} days`;
  return rule;
}

/** Rolls a YYYY-MM-DD date forward by a repeat rule. */
export function nextDueDate(dueDate: string, rule: string): string {
  const [y, m, d] = dueDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  if (rule === 'daily') {
    date.setUTCDate(date.getUTCDate() + 1);
  } else if (rule === 'weekly') {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (rule === 'monthly') {
    const day = date.getUTCDate();
    date.setUTCMonth(date.getUTCMonth() + 1);
    // setUTCMonth overflows into the following month when the original day
    // doesn't exist there (Jan 31 -> "Feb 31" -> Mar 3) — pull back to the
    // target month's actual last day instead of letting that stand.
    if (date.getUTCDate() !== day) date.setUTCDate(0);
  } else {
    const match = rule.match(CUSTOM_REPEAT_RE);
    date.setUTCDate(date.getUTCDate() + (match ? Number(match[1]) : 1));
  }

  return date.toISOString().slice(0, 10);
}
