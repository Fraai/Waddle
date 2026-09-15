import Sortable from 'sortablejs';
import { actions } from 'astro:actions';
import { attachTaskToggles } from './task-toggle';

attachTaskToggles();

document.querySelectorAll<HTMLButtonElement>('.task-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    const taskId = Number(button.dataset.taskId);
    await actions.deleteTask({ taskId });
    location.reload();
  });
});

document.querySelectorAll<HTMLButtonElement>('.section-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    if (!confirm('Delete this section? Its tasks move to the project\'s unsectioned list.')) return;
    const sectionId = Number(button.dataset.sectionId);
    await actions.deleteSection({ sectionId });
    location.reload();
  });
});

const root = document.querySelector<HTMLElement>('[data-project-id]');
const projectId = root ? Number(root.dataset.projectId) : null;

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
        await actions.reorderTasks({ projectId, sectionId, orderedIds });
        location.reload();
      },
    });
  });
}
