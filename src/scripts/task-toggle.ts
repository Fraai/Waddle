import { actions } from 'astro:actions';

export function attachTaskToggles(): void {
  document.querySelectorAll<HTMLInputElement>('.task-toggle').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const taskId = Number(checkbox.dataset.taskId);
      const { error } = await actions.toggleTaskDone({ taskId });
      if (error) { alert(error.message); return; }
      location.reload();
    });
  });
}

attachTaskToggles();
