import Sortable from 'sortablejs';
import { actions } from 'astro:actions';
// Importing runs task-toggle's own setup — don't call attachTaskToggles()
// again here or every checkbox gets two listeners.
import './task-toggle';

function bumpOpenCount(delta: number): void {
  const el = document.querySelector<HTMLElement>('[data-open-count]');
  if (!el) return;
  const next = Math.max(0, Number(el.dataset.openCount ?? 0) + delta);
  el.dataset.openCount = String(next);
  el.textContent = next === 0 ? 'All clear' : `${next} open ${next === 1 ? 'task' : 'tasks'}`;
}

document.querySelectorAll<HTMLButtonElement>('.task-delete').forEach((button) => {
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
});

// Deleting a section moves its tasks back to the unsectioned list, which is a
// structural change — cheaper to re-render than to reshuffle the DOM by hand.
document.querySelectorAll<HTMLButtonElement>('.section-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    if (!confirm('Delete this section? Its tasks move to the project\'s unsectioned list.')) return;
    const sectionId = Number(button.dataset.sectionId);
    const { error } = await actions.deleteSection({ sectionId });
    if (error) {
      alert(error.message);
      return;
    }
    location.reload();
  });
});

const root = document.querySelector<HTMLElement>('[data-project-root]');
const projectId = root ? Number(root.dataset.projectRoot) : null;

if (projectId !== null) {
  document.querySelectorAll<HTMLElement>('.task-list').forEach((list) => {
    new Sortable(list, {
      group: 'tasks',
      animation: 150,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      onEnd: async (event) => {
        const target = event.to;
        const sectionIdRaw = target.dataset.sectionId;
        const sectionId = sectionIdRaw ? Number(sectionIdRaw) : null;
        const orderedIds = [...target.children].map((el) => Number((el as HTMLElement).dataset.taskId));

        // The DOM already shows the new order — only reload if the write fails.
        const { error } = await actions.reorderTasks({ projectId, sectionId, orderedIds });
        if (error) {
          alert(error.message);
          location.reload();
        }
      },
    });
  });
}
