import { actions } from 'astro:actions';
import { bumpOpenCount } from './open-count';

// Exported per-element so newly-inserted rows (added without a reload) can
// be wired up individually — see attachTaskToggle for why.
export function attachTaskDelete(button: HTMLButtonElement): void {
  button.addEventListener('click', async () => {
    const taskId = Number(button.dataset.taskId);
    const row = button.closest<HTMLElement>('li');
    const wasOpen = !row?.querySelector<HTMLInputElement>('.task-toggle')?.checked;

    // Optimistic: hide now, drop it for good once the delete lands.
    if (row) row.hidden = true;
    if (wasOpen) bumpOpenCount(-1);

    const { error } = await actions.deleteTask({ taskId });
    if (error) {
      if (row) row.hidden = false;
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
