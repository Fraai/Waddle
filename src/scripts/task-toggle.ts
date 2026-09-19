import { actions } from 'astro:actions';
import { bumpOpenCount } from './open-count';

function paint(checkbox: HTMLInputElement): void {
  const title = checkbox.nextElementSibling;
  if (title?.classList.contains('task-title')) {
    title.toggleAttribute('data-done', checkbox.checked);
  }
}

// Exported per-element so newly-inserted rows (added without a reload) can
// be wired up individually — re-running the bulk attach below would give
// every pre-existing checkbox a second listener.
export function attachTaskToggle(checkbox: HTMLInputElement): void {
  checkbox.addEventListener('change', async () => {
    const taskId = Number(checkbox.dataset.taskId);
    const row = checkbox.closest<HTMLElement>('li');
    // Top-level tasks (class task-row) are the ones the header counts —
    // subtasks (class subtask) aren't. Both wrap their checkbox in the same
    // .task-main div, so that alone can't tell them apart.
    const countable = row?.classList.contains('task-row') ?? false;
    // Today/Upcoming only ever query *open* tasks — once one is done it no
    // longer belongs in that list at all, so hide the row instead of just
    // striking it through (which project pages do, since they show done
    // tasks too).
    const removeOnDone = row?.closest('[data-remove-done]') != null;

    if (removeOnDone && checkbox.checked) {
      if (row) row.hidden = true;
    } else {
      paint(checkbox);
    }
    if (countable) bumpOpenCount(checkbox.checked ? -1 : 1);

    const { error } = await actions.toggleTaskDone({ taskId });
    if (error) {
      checkbox.checked = !checkbox.checked;
      if (removeOnDone) {
        if (row) row.hidden = false;
      } else {
        paint(checkbox);
      }
      if (countable) bumpOpenCount(checkbox.checked ? -1 : 1);
      alert(error.message);
    }
  });
}

export function attachTaskToggles(): void {
  document.querySelectorAll<HTMLInputElement>('.task-toggle').forEach(attachTaskToggle);
}

attachTaskToggles();
