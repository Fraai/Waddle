import { actions } from 'astro:actions';
import { bumpOpenCount } from './open-count';
import { showToast } from './toast';

const UNDO_WINDOW_MS = 5000;

// Exported per-element so newly-inserted rows (added without a reload) can
// be wired up individually — see attachTaskToggle for why.
export function attachTaskDelete(button: HTMLButtonElement): void {
  button.addEventListener('click', () => {
    const taskId = Number(button.dataset.taskId);
    const row = button.closest<HTMLElement>('li');
    if (!row) return;
    const title = row.querySelector('.task-title')?.textContent ?? 'Task';
    // Top-level tasks (class task-row) are the ones the header counts —
    // subtasks (class subtask) aren't.
    const countable = row.classList.contains('task-row');
    const wasOpen = countable && !row.querySelector<HTMLInputElement>('.task-toggle')?.checked;

    // Optimistic: fade and hide now. The actual server delete is held until
    // the undo window closes, so "Undo" just needs to cancel that timer and
    // unhide the row — no need to delete-then-recreate a matching task.
    row.classList.add('row-leave');
    row.hidden = true;
    if (wasOpen) bumpOpenCount(-1);

    const timer = window.setTimeout(async () => {
      const { error } = await actions.deleteTask({ taskId });
      if (error) {
        // Row is already hidden client-side; reload to resync with the server.
        alert(error.message);
        location.reload();
      } else {
        row.remove();
      }
    }, UNDO_WINDOW_MS);

    showToast(`Deleted "${title}"`, () => {
      clearTimeout(timer);
      row.hidden = false;
      row.classList.remove('row-leave');
      if (wasOpen) bumpOpenCount(1);
    });
  });
}

export function attachTaskDeletes(): void {
  document.querySelectorAll<HTMLButtonElement>('.task-delete').forEach(attachTaskDelete);
}

attachTaskDeletes();
