import { actions } from 'astro:actions';

/** Keeps the project header's "N open tasks" line honest without a reload. */
function bumpOpenCount(delta: number): void {
  const el = document.querySelector<HTMLElement>('[data-open-count]');
  if (!el) return;
  const next = Math.max(0, Number(el.dataset.openCount ?? 0) + delta);
  el.dataset.openCount = String(next);
  el.textContent = next === 0 ? 'All clear' : `${next} open ${next === 1 ? 'task' : 'tasks'}`;
}

function paint(checkbox: HTMLInputElement): void {
  const title = checkbox.nextElementSibling;
  if (title?.classList.contains('task-title')) {
    title.toggleAttribute('data-done', checkbox.checked);
  }
}

export function attachTaskToggles(): void {
  document.querySelectorAll<HTMLInputElement>('.task-toggle').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const taskId = Number(checkbox.dataset.taskId);
      // Top-level tasks are the ones the header counts; subtasks aren't.
      const countable = checkbox.closest('.task-main') !== null;

      // Optimistic: the native checkbox already flipped, so reflect the rest
      // immediately and let the write land in the background.
      paint(checkbox);
      if (countable) bumpOpenCount(checkbox.checked ? -1 : 1);

      const { error } = await actions.toggleTaskDone({ taskId });
      if (error) {
        checkbox.checked = !checkbox.checked;
        paint(checkbox);
        if (countable) bumpOpenCount(checkbox.checked ? -1 : 1);
        alert(error.message);
      }
    });
  });
}

attachTaskToggles();
