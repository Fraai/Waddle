import Sortable from 'sortablejs';
import { actions } from 'astro:actions';

const list = document.getElementById('project-list');
if (list) {
  new Sortable(list, {
    animation: 150,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    onEnd: async () => {
      const orderedIds = [...list.children].map((el) => Number((el as HTMLElement).dataset.projectId));
      // The DOM already shows the new order — only reload if the write fails.
      const { error } = await actions.reorderProjects({ orderedIds });
      if (error) {
        alert(error.message);
        location.reload();
      }
    },
  });
}

document.querySelectorAll<HTMLButtonElement>('.project-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    if (!confirm('Delete this project and all its tasks?')) return;
    const projectId = Number(button.dataset.projectId);
    const row = button.closest<HTMLElement>('li');
    const onThisProject = location.pathname === `/app/projects/${projectId}`;

    if (row) row.hidden = true;

    const { error } = await actions.deleteProject({ projectId });
    if (error) {
      if (row) row.hidden = false;
      alert(error.message);
      return;
    }

    // Only leave the page if you just deleted the project you're looking at.
    if (onThisProject) {
      location.href = '/app/today';
      return;
    }
    row?.remove();
  });
});
