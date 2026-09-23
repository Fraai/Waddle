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
import { buildMoveButton, refreshMoveButtons, swapWithSibling } from './keyboard-reorder';

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
    const moveBtns = h2 ? [...h2.querySelectorAll<HTMLButtonElement>('.move-btn')] : [];
    if (!h2 || !nameEl) return;

    startInlineRename({
      container: h2,
      displayEl: nameEl,
      hideWhileEditing: [button, ...(deleteBtn ? [deleteBtn] : []), ...moveBtns],
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

async function commitTaskOrder(list: HTMLElement, pid: number): Promise<void> {
  const sectionIdRaw = list.dataset.sectionId;
  const sectionId = sectionIdRaw ? Number(sectionIdRaw) : null;
  const orderedIds = [...list.children].map((el) => Number((el as HTMLElement).dataset.taskId));
  // The DOM already shows the new order — only reload if the write fails.
  const { error } = await actions.reorderTasks({ projectId: pid, sectionId, orderedIds });
  if (error) {
    alert(error.message);
    location.reload();
  }
}

// Keyboard move is scoped to within one list (one section) — unlike drag,
// which can also carry a task across sections via the shared 'tasks' group.
// Moving a task to a different section is a rarer move than reordering
// within one; within-list keyboard parity covers the core operation.
function attachTaskMoveButtons(li: HTMLElement, list: HTMLElement, pid: number): void {
  const up = li.querySelector<HTMLButtonElement>('.move-up');
  const down = li.querySelector<HTMLButtonElement>('.move-down');
  up?.addEventListener('click', async () => {
    if (!swapWithSibling(li, 'up', () => true)) return;
    refreshMoveButtons(list);
    await commitTaskOrder(list, pid);
  });
  down?.addEventListener('click', async () => {
    if (!swapWithSibling(li, 'down', () => true)) return;
    refreshMoveButtons(list);
    await commitTaskOrder(list, pid);
  });
}

function makeTaskListSortable(list: HTMLElement, pid: number): void {
  new Sortable(list, {
    group: 'tasks',
    animation: 150,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    onEnd: (event) => commitTaskOrder(event.to, pid),
  });
  ([...list.children] as HTMLElement[]).forEach((el) => attachTaskMoveButtons(el, list, pid));
  refreshMoveButtons(list);
}

// The unsectioned group (data-section-id="") always renders first and isn't
// a real section — excluded from both drag (it has no .section-handle to
// start a drag from, and onMove below refuses to drop before it) and
// keyboard move so it can't be reordered or pushed out of first place.
const isRealSection = (el: Element) => (el as HTMLElement).dataset.sectionId !== '';
const sectionsContainer = document.getElementById('sections-container');

async function commitSectionOrder(): Promise<void> {
  if (!sectionsContainer || projectId === null) return;
  const orderedIds = [...sectionsContainer.children]
    .map((el) => (el as HTMLElement).dataset.sectionId)
    .filter((id): id is string => !!id)
    .map(Number);
  // The DOM already shows the new order — only reload if the write fails.
  const { error } = await actions.reorderSections({ projectId, orderedIds });
  if (error) {
    alert(error.message);
    location.reload();
  }
}

function attachSectionMoveButtons(h2: HTMLElement): void {
  const section = h2.closest<HTMLElement>('[data-section-id]');
  if (!sectionsContainer || !section || section.dataset.sectionId === '') return;
  const up = h2.querySelector<HTMLButtonElement>('.move-up');
  const down = h2.querySelector<HTMLButtonElement>('.move-down');
  up?.addEventListener('click', async () => {
    if (!swapWithSibling(section, 'up', isRealSection)) return;
    refreshMoveButtons(sectionsContainer, (el) => (isRealSection(el) ? 'section' : 'unsectioned'));
    await commitSectionOrder();
  });
  down?.addEventListener('click', async () => {
    if (!swapWithSibling(section, 'down', isRealSection)) return;
    refreshMoveButtons(sectionsContainer, (el) => (isRealSection(el) ? 'section' : 'unsectioned'));
    await commitSectionOrder();
  });
}

if (root && projectId !== null) {
  document.querySelectorAll<HTMLElement>('.task-list').forEach((list) => makeTaskListSortable(list, projectId));

  if (sectionsContainer) {
    document.querySelectorAll<HTMLElement>('.section-handle').forEach(attachSectionMoveButtons);
    refreshMoveButtons(sectionsContainer, (el) => (isRealSection(el) ? 'section' : 'unsectioned'));

    new Sortable(sectionsContainer, {
      handle: '.section-handle',
      animation: 150,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      onMove: (event) => (event.related as HTMLElement).dataset.sectionId !== '',
      onEnd: commitSectionOrder,
    });
  }

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
    block.className = 'mb-6 row-enter';
    block.dataset.sectionId = String(section.id);

    const h2 = document.createElement('h2');
    h2.className = 'label-caps mb-2 flex items-center gap-2 section-handle';
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
    const moveUpBtn = buildMoveButton('up', section.name);
    const moveDownBtn = buildMoveButton('down', section.name);
    h2.append(nameEl, renameBtn, deleteBtn, moveUpBtn, moveDownBtn);

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
    sectionsContainer?.append(block);

    attachSectionRename(renameBtn);
    attachSectionDelete(deleteBtn);
    attachSectionMoveButtons(h2);
    if (sectionsContainer) refreshMoveButtons(sectionsContainer, (el) => (isRealSection(el) ? 'section' : 'unsectioned'));
    makeTaskListSortable(list, projectId);
    attachProjectComposer(form, root);

    input.value = '';
    input.focus();
  });
}
