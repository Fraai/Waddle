import Sortable from 'sortablejs';
import { actions } from 'astro:actions';
import { startInlineRename } from './inline-rename';
// Importing runs task-toggle's/task-delete's own setup — don't re-attach
// their listeners here or every checkbox/button gets two.
import './task-toggle';
import './task-delete';
import './task-edit';

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

document.querySelectorAll<HTMLButtonElement>('.section-rename').forEach((button) => {
  button.addEventListener('click', () => {
    const sectionId = Number(button.dataset.sectionId);
    const h2 = button.closest<HTMLElement>('h2');
    const nameEl = h2?.querySelector<HTMLElement>('.section-name');
    const deleteBtn = h2?.querySelector<HTMLButtonElement>('.section-delete');
    if (!h2 || !nameEl) return;

    startInlineRename({
      container: h2,
      displayEl: nameEl,
      hideWhileEditing: [button, ...(deleteBtn ? [deleteBtn] : [])],
      currentValue: nameEl.textContent ?? '',
      save: (name) => actions.renameSection({ sectionId, name }),
      onSaved: (name) => {
        nameEl.textContent = name;
        if (deleteBtn) deleteBtn.title = `Delete ${name}`;
      },
    });
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
