import Sortable from 'sortablejs';
import { actions } from 'astro:actions';
import { startInlineRename } from './inline-rename';
// Importing runs task-toggle's/task-delete's/task-edit's/task-create's own
// setup — don't re-attach their listeners here or every element gets two.
import './task-toggle';
import './task-delete';
import './task-edit';
import './task-create';
import { attachProjectComposer } from './task-create';

const RENAME_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.3 2.7a1.2 1.2 0 0 1 1.7 1.7L5.6 12l-2.4.7.7-2.4z" /></svg><span class="sr-only">Rename section</span>';
const DELETE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg><span class="sr-only">Delete section</span>';
const ADD_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9" /></svg><span class="sr-only">Add task</span>';

// Deleting a section moves its tasks back to the unsectioned list, which is a
// structural change — cheaper to re-render than to reshuffle the DOM by hand.
function attachSectionDelete(button: HTMLButtonElement): void {
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
}

function attachSectionRename(button: HTMLButtonElement): void {
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
}

document.querySelectorAll<HTMLButtonElement>('.section-delete').forEach(attachSectionDelete);
document.querySelectorAll<HTMLButtonElement>('.section-rename').forEach(attachSectionRename);

const root = document.querySelector<HTMLElement>('[data-project-root]');
const projectId = root ? Number(root.dataset.projectRoot) : null;

function makeTaskListSortable(list: HTMLElement, pid: number): void {
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
      const { error } = await actions.reorderTasks({ projectId: pid, sectionId, orderedIds });
      if (error) {
        alert(error.message);
        location.reload();
      }
    },
  });
}

if (root && projectId !== null) {
  document.querySelectorAll<HTMLElement>('.task-list').forEach((list) => makeTaskListSortable(list, projectId));

  const newSectionForm = document.getElementById('new-section')?.closest('form');
  newSectionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = newSectionForm.querySelector<HTMLInputElement>('#new-section');
    if (!input) return;

    // Snapshot before disabling — a disabled control is excluded from FormData.
    const formData = new FormData(newSectionForm);
    input.disabled = true;
    const { data: section, error } = await actions.createSection(formData);
    input.disabled = false;
    if (error || !section) {
      alert(error?.message ?? 'Could not create section');
      return;
    }

    const block = document.createElement('section');
    block.className = 'mb-6';

    const h2 = document.createElement('h2');
    h2.className = 'label-caps mb-2 flex items-center gap-2';
    const nameEl = document.createElement('span');
    nameEl.className = 'section-name';
    nameEl.textContent = section.name;
    const renameBtn = document.createElement('button');
    renameBtn.className = 'section-rename icon-btn';
    renameBtn.dataset.sectionId = String(section.id);
    renameBtn.title = `Rename ${section.name}`;
    renameBtn.innerHTML = RENAME_ICON;
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'section-delete icon-btn';
    deleteBtn.dataset.sectionId = String(section.id);
    deleteBtn.title = `Delete ${section.name}`;
    deleteBtn.innerHTML = DELETE_ICON;
    h2.append(nameEl, renameBtn, deleteBtn);

    const list = document.createElement('ul');
    list.className = 'task-list';
    list.dataset.sectionId = String(section.id);

    const form = document.createElement('form');
    form.className = 'composer mt-2';
    form.dataset.kind = 'project';
    const projectIdInput = document.createElement('input');
    projectIdInput.type = 'hidden';
    projectIdInput.name = 'projectId';
    projectIdInput.value = String(projectId);
    const sectionIdInput = document.createElement('input');
    sectionIdInput.type = 'hidden';
    sectionIdInput.name = 'sectionId';
    sectionIdInput.value = String(section.id);
    const titleInput = document.createElement('input');
    titleInput.name = 'title';
    titleInput.placeholder = 'Add task';
    titleInput.setAttribute('aria-label', 'Task title');
    titleInput.required = true;
    const dueInput = document.createElement('input');
    dueInput.type = 'date';
    dueInput.name = 'dueDate';
    dueInput.setAttribute('aria-label', 'Due date');
    const prioritySelect = document.createElement('select');
    prioritySelect.name = 'priority';
    prioritySelect.setAttribute('aria-label', 'Priority');
    for (const p of [4, 3, 2, 1]) {
      const opt = document.createElement('option');
      opt.value = String(p);
      opt.textContent = `P${p}`;
      opt.selected = p === 4;
      prioritySelect.append(opt);
    }
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn--submit';
    submitBtn.title = 'Add task';
    submitBtn.innerHTML = ADD_ICON;
    form.append(projectIdInput, sectionIdInput, titleInput, dueInput, prioritySelect, submitBtn);

    block.append(h2, list, form);
    newSectionForm.parentElement?.insertBefore(block, newSectionForm);

    attachSectionRename(renameBtn);
    attachSectionDelete(deleteBtn);
    makeTaskListSortable(list, projectId);
    attachProjectComposer(form, root);

    input.value = '';
    input.focus();
  });
}
