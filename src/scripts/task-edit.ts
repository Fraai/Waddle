import { actions } from 'astro:actions';

const LINK_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5 13 3M9 3h4v4M12 9v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" /></svg>';

interface ProjectOption {
  id: number;
  name: string;
}

// Every page already fetches the project list for the sidebar and embeds it
// as JSON (see AppLayout.astro) — reused here instead of a fetch just to
// populate the picker.
const PROJECTS: ProjectOption[] = JSON.parse(document.getElementById('projects-data')?.textContent || '[]');

interface Modal {
  dialog: HTMLDialogElement;
  titleInput: HTMLInputElement;
  descriptionInput: HTMLTextAreaElement;
  hrefInput: HTMLInputElement;
  hrefOpen: HTMLAnchorElement;
  projectSelect: HTMLSelectElement;
  dueInput: HTMLInputElement;
  prioritySelect: HTMLSelectElement;
  saveBtn: HTMLButtonElement;
  deleteBtn: HTMLButtonElement;
}

let modal: Modal | null = null;
// The one dialog is reused for every task — these track which row it's
// currently open for, and what it looked like when opened, so submit can
// diff against the original values and decide whether a reload is needed.
let activeLi: HTMLElement | null = null;
let baseline: { dueDate: string; priority: string; projectId: string } | null = null;

function buildModal(): Modal {
  const dialog = document.createElement('dialog');
  dialog.className = 'task-modal';

  const form = document.createElement('form');
  form.className = 'task-modal-form';

  const head = document.createElement('div');
  head.className = 'task-modal-head';
  const titleInput = document.createElement('input');
  titleInput.className = 'task-modal-title';
  titleInput.placeholder = 'Task title';
  titleInput.required = true;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'icon-btn task-modal-close';
  closeBtn.title = 'Close';
  closeBtn.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg><span class="sr-only">Close</span>';
  head.append(titleInput, closeBtn);

  const descriptionInput = document.createElement('textarea');
  descriptionInput.className = 'field task-modal-description';
  descriptionInput.placeholder = 'Add a description…';
  descriptionInput.rows = 4;

  const hrefRow = document.createElement('div');
  hrefRow.className = 'task-modal-row';
  const hrefInput = document.createElement('input');
  hrefInput.type = 'text';
  hrefInput.className = 'field flex-1';
  hrefInput.placeholder = 'Link — https://…';
  const hrefOpen = document.createElement('a');
  hrefOpen.className = 'btn btn--ghost task-modal-href-open';
  hrefOpen.target = '_blank';
  hrefOpen.rel = 'noopener';
  hrefOpen.textContent = 'Open ↗';
  hrefRow.append(hrefInput, hrefOpen);

  const projectSelect = document.createElement('select');
  projectSelect.className = 'field task-modal-project';
  for (const project of PROJECTS) {
    const opt = document.createElement('option');
    opt.value = String(project.id);
    opt.textContent = project.name;
    projectSelect.append(opt);
  }

  const metaRow = document.createElement('div');
  metaRow.className = 'task-modal-row';
  const dueInput = document.createElement('input');
  dueInput.type = 'date';
  dueInput.className = 'field';
  const prioritySelect = document.createElement('select');
  prioritySelect.className = 'field';
  for (const p of [4, 3, 2, 1]) {
    const opt = document.createElement('option');
    opt.value = String(p);
    opt.textContent = `P${p}`;
    prioritySelect.append(opt);
  }
  metaRow.append(dueInput, prioritySelect);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'task-modal-actions';
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn--ghost task-modal-delete';
  deleteBtn.textContent = 'Delete';
  const actionsRight = document.createElement('div');
  actionsRight.className = 'flex gap-2';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Save';
  actionsRight.append(cancelBtn, saveBtn);
  actionsRow.append(deleteBtn, actionsRight);

  form.append(head, descriptionInput, projectSelect, hrefRow, metaRow, actionsRow);
  dialog.append(form);
  document.body.append(dialog);

  closeBtn.addEventListener('click', () => dialog.close());
  cancelBtn.addEventListener('click', () => dialog.close());
  // The backdrop is the ::backdrop pseudo-element — a click that lands there
  // (not on any element inside the dialog's own box) reports the dialog
  // itself as the target, which is what distinguishes it from a click on
  // the form or its fields.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    activeLi = null;
    baseline = null;
  });

  hrefInput.addEventListener('input', () => {
    hrefOpen.hidden = hrefInput.value.trim() === '';
    hrefOpen.href = hrefInput.value;
  });

  deleteBtn.addEventListener('click', () => {
    const rowDeleteBtn = activeLi?.querySelector<HTMLButtonElement>('.task-delete');
    dialog.close();
    rowDeleteBtn?.click();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeLi || !baseline) return;
    const li = activeLi;
    const titleEl = li.querySelector<HTMLElement>('.task-title');
    if (!titleEl) return;

    saveBtn.disabled = true;
    deleteBtn.disabled = true;

    const dueChanged = dueInput.value !== baseline.dueDate;
    const priorityChanged = prioritySelect.value !== baseline.priority;
    // Hidden for a subtask (see openTaskModal) — baseline.projectId is '' in
    // that case, which would otherwise never match any real option value.
    const projectChanged = !projectSelect.hidden && projectSelect.value !== baseline.projectId;

    const { error } = await actions.updateTask({
      taskId: Number(li.dataset.taskId),
      title: titleInput.value,
      description: descriptionInput.value || null,
      href: hrefInput.value || null,
      dueDate: dueInput.value || null,
      priority: Number(prioritySelect.value),
      ...(projectChanged ? { projectId: Number(projectSelect.value) } : {}),
    });

    if (error) {
      alert(error.message);
      saveBtn.disabled = false;
      deleteBtn.disabled = false;
      return;
    }

    // A due-date, priority, or project change can move the task into a
    // different day group, section order, or off the page entirely (if
    // it's no longer this project's) — reload to stay correct.
    // Title/description/link never affect any of that, so those update in
    // place.
    if (dueChanged || priorityChanged || projectChanged) {
      location.reload();
      return;
    }

    titleEl.textContent = titleInput.value;
    li.dataset.description = descriptionInput.value;
    li.dataset.href = hrefInput.value;
    syncHrefBadge(li, hrefInput.value);
    saveBtn.disabled = false;
    deleteBtn.disabled = false;
    dialog.close();
  });

  return {
    dialog, titleInput, descriptionInput, hrefInput, hrefOpen, projectSelect, dueInput, prioritySelect,
    saveBtn, deleteBtn,
  };
}

function ensureModal(): Modal {
  if (!modal) modal = buildModal();
  return modal;
}

/** Adds, updates, or removes a row's small "has a link" badge in place —
 * used both after a modal save and (via buildTaskRow) for newly-created
 * rows, so it never needs a reload just to reflect a link. */
export function syncHrefBadge(li: HTMLElement, href: string): void {
  const main = li.querySelector<HTMLElement>('.task-main');
  const titleEl = main?.querySelector<HTMLElement>('.task-title');
  if (!main || !titleEl) return;
  let badge = main.querySelector<HTMLAnchorElement>('.task-href-badge');

  if (!href) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('a');
    badge.className = 'task-href-badge';
    badge.target = '_blank';
    badge.rel = 'noopener';
    badge.innerHTML = LINK_ICON;
    titleEl.insertAdjacentElement('afterend', badge);
  }
  badge.href = href;
  badge.title = href;
}

function openTaskModal(li: HTMLElement): void {
  const titleEl = li.querySelector<HTMLElement>('.task-title');
  if (!titleEl) return;
  const m = ensureModal();

  activeLi = li;
  const dueDate = li.dataset.dueDate || '';
  const priority = li.dataset.priority || '4';
  const projectId = li.dataset.projectId || '';
  baseline = { dueDate, priority, projectId };

  m.titleInput.value = titleEl.textContent ?? '';
  m.descriptionInput.value = li.dataset.description || '';
  m.hrefInput.value = li.dataset.href || '';
  m.hrefOpen.hidden = !m.hrefInput.value;
  m.hrefOpen.href = m.hrefInput.value;
  m.projectSelect.value = projectId;
  m.dueInput.value = dueDate;
  m.prioritySelect.value = priority;
  m.saveBtn.disabled = false;
  m.deleteBtn.disabled = false;
  // Subtasks have no delete button on the row (they can't be deleted from
  // the UI at all today) — hide the modal's delete to match, rather than
  // offering an action that has nothing to wire up to. A subtask also
  // always belongs to its parent's project, so moving it independently
  // would leave it inconsistent with the parent — hide the picker rather
  // than letting that happen.
  const isSubtask = !li.querySelector('.task-delete');
  m.deleteBtn.hidden = isSubtask;
  m.projectSelect.hidden = isSubtask;

  m.dialog.showModal();
  m.titleInput.focus();
}

export function attachTaskEdit(titleEl: HTMLElement): void {
  titleEl.addEventListener('click', () => {
    const li = titleEl.closest<HTMLElement>('li');
    if (li) openTaskModal(li);
  });
}

export function attachTaskEdits(): void {
  document.querySelectorAll<HTMLElement>('.task-title').forEach(attachTaskEdit);
}

attachTaskEdits();
