import Sortable from 'sortablejs';
import { actions } from 'astro:actions';

const list = document.getElementById('project-list');
if (list) {
  new Sortable(list, {
    animation: 150,
    onEnd: async () => {
      const orderedIds = [...list.children].map((el) => Number((el as HTMLElement).dataset.projectId));
      await actions.reorderProjects({ orderedIds });
    },
  });
}

document.querySelectorAll<HTMLButtonElement>('.project-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    if (!confirm('Delete this project and all its tasks?')) return;
    const projectId = Number(button.dataset.projectId);
    await actions.deleteProject({ projectId });
    location.href = '/app/today';
  });
});
