import Sortable from 'sortablejs';
import { actions } from 'astro:actions';
// Side-effect import only: task-toggle.ts self-invokes attachTaskToggles() at
// module load, which is what Tasks 13-14 rely on when loading it standalone.
// Calling attachTaskToggles() again here would double-register `change`
// listeners on every checkbox (each toggle click would fire toggleTaskDone twice).
import './task-toggle';

document.querySelectorAll<HTMLButtonElement>('.task-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    const taskId = Number(button.dataset.taskId);
    const { error } = await actions.deleteTask({ taskId });
    if (error) { alert(error.message); return; }
    location.reload();
  });
});

document.querySelectorAll<HTMLButtonElement>('.section-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    if (!confirm('Delete this section? Its tasks move to the project\'s unsectioned list.')) return;
    const sectionId = Number(button.dataset.sectionId);
    const { error } = await actions.deleteSection({ sectionId });
    if (error) { alert(error.message); return; }
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
      onEnd: async (event) => {
        const target = event.to;
        const sectionIdRaw = target.dataset.sectionId;
        const sectionId = sectionIdRaw ? Number(sectionIdRaw) : null;
        const orderedIds = [...target.children].map((el) => Number((el as HTMLElement).dataset.taskId));
        const { error } = await actions.reorderTasks({ projectId, sectionId, orderedIds });
        if (error) { alert(error.message); return; }
        location.reload();
      },
    });
  });
}
