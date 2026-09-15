import { actions } from 'astro:actions';

export function attachTaskToggles(): void {
  document.querySelectorAll<HTMLInputElement>('.task-toggle').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const taskId = Number(checkbox.dataset.taskId);
      await actions.toggleTaskDone({ taskId });
      location.reload();
    });
  });
}

attachTaskToggles();
