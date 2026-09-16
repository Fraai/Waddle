/** Keeps a page's "N open tasks" line honest without a reload. */
export function bumpOpenCount(delta: number): void {
  const el = document.querySelector<HTMLElement>('[data-open-count]');
  if (!el) return;
  const next = Math.max(0, Number(el.dataset.openCount ?? 0) + delta);
  el.dataset.openCount = String(next);
  el.textContent = next === 0 ? 'All clear' : `${next} open ${next === 1 ? 'task' : 'tasks'}`;
}
