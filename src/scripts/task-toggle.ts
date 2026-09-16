import { actions } from 'astro:actions';
import { bumpOpenCount } from './open-count';

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
      const row = checkbox.closest<HTMLElement>('li');
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
  });
}

attachTaskToggles();
