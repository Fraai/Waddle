import { actions } from 'astro:actions';
import { bumpOpenCount } from './open-count';
import { attachTaskToggle } from './task-toggle';
import { attachTaskDelete } from './task-delete';
import { attachTaskEdit } from './task-edit';
import { formatDate, formatDateHeading } from '../lib/format';

const DELETE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg><span class="sr-only">Delete task</span>';

// Same spacing as AppLayout.astro's sidebar dots — golden-angle hue steps
// give every project a distinct, stable colour without storing one.
const projectHue = (id: number) => (id * 137.5) % 360;

interface CreatedTask {
  id: number;
  title: string;
  due_date: string | null;
  priority: number;
  project_id: number;
}

/** Builds a top-level task row identical to the server-rendered markup.
 * `subtaskAddProjectId` set means this row needs its own "Add subtask" form
 * — true on project pages, never on Today/Upcoming (no subtasks there). */
function buildTaskRow(
  task: CreatedTask,
  opts: {
    showPill: boolean;
    today: string;
    subtaskAddProjectId?: number;
    projectDot?: { projectId: number; name: string };
    projectType?: string;
  },
): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.taskId = String(task.id);
  li.dataset.priority = String(task.priority);
  li.dataset.dueDate = task.due_date ?? '';
  li.dataset.projectId = String(task.project_id);
  if (opts.projectType) li.dataset.projectType = opts.projectType;
  li.className = 'task-row';

  const main = document.createElement('div');
  main.className = 'task-main';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-toggle check';
  checkbox.dataset.taskId = String(task.id);
  checkbox.setAttribute('aria-label', `Mark "${task.title}" done`);

  main.append(checkbox);

  if (opts.projectDot) {
    const dot = document.createElement('span');
    dot.className = 'project-dot';
    dot.style.setProperty('--dot', `hsl(${projectHue(opts.projectDot.projectId)} 62% 52%)`);
    dot.title = opts.projectDot.name;
    main.append(dot);
  }

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  main.append(title);

  if (opts.showPill && task.due_date) {
    const pill = document.createElement('span');
    pill.className = task.due_date < opts.today ? 'pill pill--overdue' : 'pill';
    pill.textContent = formatDate(task.due_date);
    main.append(pill);
  }

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'task-delete icon-btn';
  del.dataset.taskId = String(task.id);
  del.title = `Delete "${task.title}"`;
  del.innerHTML = DELETE_ICON;
  main.append(del);

  li.append(main);

  if (opts.subtaskAddProjectId !== undefined) {
    const subtaskForm = document.createElement('form');
    subtaskForm.className = 'subtask-add';
    const projectIdInput = document.createElement('input');
    projectIdInput.type = 'hidden';
    projectIdInput.name = 'projectId';
    projectIdInput.value = String(opts.subtaskAddProjectId);
    const parentIdInput = document.createElement('input');
    parentIdInput.type = 'hidden';
    parentIdInput.name = 'parentTaskId';
    parentIdInput.value = String(task.id);
    const subtaskTitle = document.createElement('input');
    subtaskTitle.name = 'title';
    subtaskTitle.placeholder = 'Add subtask';
    subtaskTitle.setAttribute('aria-label', 'Add subtask');
    subtaskTitle.className = 'w-full border-0 bg-transparent p-0 text-[0.8125rem] outline-none placeholder:text-[var(--text-3)]';
    subtaskTitle.required = true;
    subtaskForm.append(projectIdInput, parentIdInput, subtaskTitle);
    li.append(subtaskForm);
    attachSubtaskComposer(subtaskForm);
  }

  attachTaskToggle(checkbox);
  attachTaskDelete(del);
  attachTaskEdit(title);
  return li;
}

/** Builds a subtask row — no pill, no delete, matching server markup. */
function buildSubtaskRow(task: CreatedTask): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'subtask';
  li.dataset.taskId = String(task.id);
  li.dataset.priority = String(task.priority);
  li.dataset.dueDate = task.due_date ?? '';

  const main = document.createElement('div');
  main.className = 'task-main';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-toggle check';
  checkbox.dataset.taskId = String(task.id);
  checkbox.setAttribute('aria-label', `Mark "${task.title}" done`);

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  main.append(checkbox, title);
  li.append(main);

  attachTaskToggle(checkbox);
  attachTaskEdit(title);
  return li;
}

function setPending(form: HTMLFormElement, pending: boolean): void {
  for (const el of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
    'input, select, button',
  )) {
    el.disabled = pending;
  }
}

async function submitCreateTask(form: HTMLFormElement): Promise<CreatedTask | null> {
  // Snapshot before disabling — a disabled control is excluded from
  // FormData entirely, which would drop hidden fields like projectId.
  const formData = new FormData(form);
  setPending(form, true);
  const { data, error } = await actions.createTask(formData);
  if (error) {
    setPending(form, false);
    alert(error.message);
    return null;
  }
  setPending(form, false);
  return data as CreatedTask;
}

function resetTitle(form: HTMLFormElement): void {
  const titleInput = form.querySelector<HTMLInputElement>('input[name="title"]');
  if (titleInput) {
    titleInput.value = '';
    titleInput.focus();
  }
}

/** Today's "Due today" composer — always lands, undated pill, in that one list. */
function attachTodayComposer(form: HTMLFormElement): void {
  const projectType = form.dataset.projectType;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const task = await submitCreateTask(form);
    if (!task) return;

    const section = form.closest('section');
    let list = section?.querySelector<HTMLUListElement>('ul.task-list[data-remove-done]');
    if (!list && section) {
      list = document.createElement('ul');
      list.className = 'task-list';
      list.dataset.removeDone = '';
      section.querySelector('.empty')?.replaceWith(list);
    }
    list?.append(buildTaskRow(task, { showPill: false, today: '', projectType }));
    resetTitle(form);
  });
}

/** A project page's per-section (or unsectioned) composer. */
function attachProjectComposer(form: HTMLFormElement, projectRoot: HTMLElement): void {
  const today = projectRoot.dataset.today ?? '';
  const projectId = Number(projectRoot.dataset.projectRoot);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const task = await submitCreateTask(form);
    if (!task) return;

    const section = form.closest('section');
    const list = section?.querySelector<HTMLUListElement>('ul.task-list');
    list?.append(buildTaskRow(task, { showPill: true, today, subtaskAddProjectId: projectId }));
    section?.querySelector('.empty')?.remove();
    bumpOpenCount(1);
    resetTitle(form);
  });
}

/** A task's "Add subtask" form — one line, no button, submits on Enter. */
function attachSubtaskComposer(form: HTMLFormElement): void {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const task = await submitCreateTask(form);
    if (!task) return;

    const li = form.closest('li');
    let list = li?.querySelector<HTMLUListElement>('ul.subtasks');
    if (!list && li) {
      list = document.createElement('ul');
      list.className = 'subtasks';
      li.insertBefore(list, form);
    }
    list?.append(buildSubtaskRow(task));
    resetTitle(form);
  });
}

/** Upcoming's composer — the new task's own date decides which day it joins,
 * which may not have a group on the page yet. */
function attachUpcomingComposer(form: HTMLFormElement): void {
  const dueInput = form.querySelector<HTMLInputElement>('input[type="date"]');
  const today = dueInput?.min ?? '';
  const projectType = form.dataset.projectType;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dueDate = dueInput?.value;
    if (!dueDate) return;
    const task = await submitCreateTask(form);
    if (!task) return;

    const container = form.parentElement;
    if (!container) return;
    container.querySelector(':scope > .empty')?.remove();

    let section = container.querySelector<HTMLElement>(`section[data-date="${dueDate}"]`);
    if (!section) {
      section = document.createElement('section');
      section.className = 'mb-6';
      section.dataset.date = dueDate;

      const heading = document.createElement('h2');
      heading.className = 'label-caps mb-2';
      heading.textContent = formatDateHeading(dueDate, today);

      const list = document.createElement('ul');
      list.className = 'task-list';
      list.dataset.removeDone = '';

      section.append(heading, list);

      const existing = [...container.querySelectorAll<HTMLElement>('section[data-date]')];
      const next = existing.find((s) => (s.dataset.date ?? '') > dueDate);
      container.insertBefore(section, next ?? form);
    }

    section.querySelector<HTMLUListElement>('ul.task-list')?.append(buildTaskRow(task, { showPill: false, today: '', projectType }));

    const count = container.querySelectorAll('section[data-date]').length;
    const countEl = container.querySelector<HTMLElement>('.page-head p');
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'day' : 'days'} ahead`;

    resetTitle(form);
  });
}

/** A Week column's composer — always creates into Inbox with that column's
 * fixed date, and (unlike Today) the target list always exists, so no
 * empty-state swap is needed. */
function attachWeekComposer(form: HTMLFormElement): void {
  const projectIdInput = form.querySelector<HTMLInputElement>('input[name="projectId"]');
  const projectId = Number(projectIdInput?.value);
  const projectType = form.dataset.projectType;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const task = await submitCreateTask(form);
    if (!task) return;

    const section = form.closest('section');
    const list = section?.querySelector<HTMLUListElement>('ul.task-list');
    list?.append(
      buildTaskRow(task, { showPill: false, today: '', projectDot: { projectId, name: 'Inbox' }, projectType }),
    );
    resetTitle(form);
  });
}

export function attachTaskComposers(): void {
  const projectRoot = document.querySelector<HTMLElement>('[data-project-root]');

  document.querySelectorAll<HTMLFormElement>('form[data-kind="today"]').forEach(attachTodayComposer);
  document.querySelectorAll<HTMLFormElement>('form[data-kind="upcoming"]').forEach(attachUpcomingComposer);
  document.querySelectorAll<HTMLFormElement>('form[data-kind="week"]').forEach(attachWeekComposer);
  if (projectRoot) {
    document
      .querySelectorAll<HTMLFormElement>('form[data-kind="project"]')
      .forEach((form) => attachProjectComposer(form, projectRoot));
  }
  document.querySelectorAll<HTMLFormElement>('form.subtask-add').forEach(attachSubtaskComposer);
}

export { attachProjectComposer };

attachTaskComposers();
