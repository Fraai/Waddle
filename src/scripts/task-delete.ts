import { actions } from 'astro:actions';
import { bumpOpenCount } from './open-count';

// Exported per-element so newly-inserted rows (added without a reload) can
// be wired up individually — see attachTaskToggle for why.
export function attachTaskDelete(button: HTMLButtonElement): void {
  button.addEventListener('click', async () => {
    const taskId = Number(button.dataset.taskId);
    const row = button.closest<HTMLElement>('li');
    // Top-level tasks (class task-row) are the ones the header counts —
    // subtasks (class subtask) aren't.
    const countable = row?.classList.contains('task-row') ?? false;
    const wasOpen = countable && !row?.querySelector<HTMLInputElement>('.task-toggle')?.checked;

    // Optimistic: fade now, drop it for good once the delete lands.
    row?.classList.add('row-leave');
    if (wasOpen) bumpOpenCount(-1);

    const { error } = await actions.deleteTask({ taskId });
    if (error) {
      row?.classList.remove('row-leave');
      if (wasOpen) bumpOpenCount(1);
      alert(error.message);
      return;
    }
    row?.remove();
  });
}

export function attachTaskDeletes(): void {
  document.querySelectorAll<HTMLButtonElement>('.task-delete').forEach(attachTaskDelete);
}

attachTaskDeletes();
