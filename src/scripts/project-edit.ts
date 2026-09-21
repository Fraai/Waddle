import { actions } from 'astro:actions';

interface ProjectOption {
  id: number;
  name: string;
  isInbox: boolean;
  parentProjectId: number | null;
}

// Same JSON the task detail modal's project picker reads (see task-edit.ts)
// — already fetched for the sidebar, reused here instead of another query.
const PROJECTS: ProjectOption[] = JSON.parse(document.getElementById('projects-data')?.textContent || '[]');

interface ProjectModal {
  dialog: HTMLDialogElement;
  nameInput: HTMLInputElement;
  workBtn: HTMLButtonElement;
  privateBtn: HTMLButtonElement;
  parentField: HTMLDivElement;
  parentSelect: HTMLSelectElement;
  saveBtn: HTMLButtonElement;
  deleteBtn: HTMLButtonElement;
}

let modal: ProjectModal | null = null;
// The one dialog is reused for every project, like task-edit.ts's — this
// tracks which row it's currently open for.
let activeLi: HTMLElement | null = null;
let pendingClose: (() => void) | null = null;

// Identical fade-then-close dance as task-edit.ts's closeModal — see the
// comment on .task-modal in global.css for why the native close() has to
// wait for the fade to finish rather than run immediately.
function closeModal(dialog: HTMLDialogElement): void {
  pendingClose?.();
  dialog.classList.add('task-modal--closing');
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    dialog.removeEventListener('transitionend', finish);
    clearTimeout(timer);
    dialog.classList.remove('task-modal--closing');
    dialog.close();
    pendingClose = null;
  };
  dialog.addEventListener('transitionend', finish);
  const timer = setTimeout(finish, 300);
  pendingClose = finish;
}

// Reuses the task modal's classes (.task-modal, .task-modal-form, etc.) —
// nothing about them is actually task-specific, just named after the first
// thing that needed a modal. Same look for free, no new CSS.
function buildModal(): ProjectModal {
  const dialog = document.createElement('dialog');
  dialog.className = 'task-modal';

  const form = document.createElement('form');
  form.className = 'task-modal-form';

  const head = document.createElement('div');
  head.className = 'task-modal-head';
  const nameInput = document.createElement('input');
  nameInput.className = 'task-modal-title';
  nameInput.placeholder = 'Project name';
  nameInput.required = true;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'icon-btn task-modal-close';
  closeBtn.title = 'Close';
  closeBtn.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg><span class="sr-only">Close</span>';
  head.append(nameInput, closeBtn);

  const typeField = document.createElement('div');
  const typeLabel = document.createElement('div');
  typeLabel.className = 'label-caps mb-1';
  typeLabel.textContent = 'Type';
  const typeToggle = document.createElement('div');
  typeToggle.className = 'filter-toggle';
  typeToggle.setAttribute('role', 'group');
  typeToggle.setAttribute('aria-label', 'Project type');
  const workBtn = document.createElement('button');
  workBtn.type = 'button';
  workBtn.className = 'filter-toggle-btn';
  workBtn.textContent = 'Work';
  const privateBtn = document.createElement('button');
  privateBtn.type = 'button';
  privateBtn.className = 'filter-toggle-btn';
  privateBtn.textContent = 'Private';
  typeToggle.append(workBtn, privateBtn);
  typeField.append(typeLabel, typeToggle);

  const parentField = document.createElement('div');
  const parentLabel = document.createElement('div');
  parentLabel.className = 'label-caps mb-1';
  parentLabel.textContent = 'Parent project';
  const parentSelect = document.createElement('select');
  parentSelect.className = 'field w-full';
  parentField.append(parentLabel, parentSelect);

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

  form.append(head, typeField, parentField, actionsRow);
  dialog.append(form);
  document.body.append(dialog);

  closeBtn.addEventListener('click', () => closeModal(dialog));
  cancelBtn.addEventListener('click', () => closeModal(dialog));
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeModal(dialog);
  });
  dialog.addEventListener('close', () => {
    activeLi = null;
  });

  const selectType = (type: 'work' | 'private') => {
    workBtn.setAttribute('aria-pressed', String(type === 'work'));
    privateBtn.setAttribute('aria-pressed', String(type === 'private'));
  };
  workBtn.addEventListener('click', () => selectType('work'));
  privateBtn.addEventListener('click', () => selectType('private'));

  deleteBtn.addEventListener('click', async () => {
    if (!activeLi) return;
    if (!confirm('Delete this project and all its tasks? Its own sub-projects (if any) move to top-level instead of being deleted.')) return;
    const projectId = Number(activeLi.dataset.projectId);
    const link = activeLi.querySelector<HTMLAnchorElement>('a.nav-item');
    const onThisProject = link != null && location.pathname === link.getAttribute('href');

    deleteBtn.disabled = true;
    saveBtn.disabled = true;
    const { error } = await actions.deleteProject({ projectId });
    if (error) {
      deleteBtn.disabled = false;
      saveBtn.disabled = false;
      alert(error.message);
      return;
    }
    // A deleted parent promotes its children elsewhere in the tree, and a
    // deleted favorite/parent disappears from more than just this one row
    // — reload rather than trying to patch every place it could appear.
    location.href = onThisProject ? '/app/today' : location.pathname;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeLi) return;
    const li = activeLi;
    const projectId = Number(li.dataset.projectId);
    const name = nameInput.value.trim();
    if (!name) return;

    const nameEl = li.querySelector<HTMLElement>('.truncate');
    const currentName = nameEl?.textContent ?? '';
    const currentType = li.dataset.projectType === 'private' ? 'private' : 'work';
    const nextType = privateBtn.getAttribute('aria-pressed') === 'true' ? 'private' : 'work';
    const currentParent = li.dataset.parentId || '';
    const nextParent = parentField.hidden ? currentParent : parentSelect.value;

    saveBtn.disabled = true;
    deleteBtn.disabled = true;

    // Name/type/parent are three separate existing actions (no combined
    // "updateProject") — call whichever actually changed, then reload: a
    // rename changes the slug/URL, a type change affects the ambient
    // filter, a parent change moves the row in the tree. Patching all of
    // that in place isn't worth it for a form submitted rarely.
    if (name !== currentName) {
      const { error } = await actions.renameProject({ projectId, name });
      if (error) {
        saveBtn.disabled = false;
        deleteBtn.disabled = false;
        alert(error.message);
        return;
      }
    }
    if (nextType !== currentType) {
      const { error } = await actions.setProjectType({ projectId, type: nextType });
      if (error) {
        saveBtn.disabled = false;
        deleteBtn.disabled = false;
        alert(error.message);
        return;
      }
    }
    if (nextParent !== currentParent) {
      const parentProjectId = nextParent === '' ? null : Number(nextParent);
      const { error } = await actions.setProjectParent({ projectId, parentProjectId });
      if (error) {
        saveBtn.disabled = false;
        deleteBtn.disabled = false;
        alert(error.message);
        return;
      }
    }

    location.reload();
  });

  return { dialog, nameInput, workBtn, privateBtn, parentField, parentSelect, saveBtn, deleteBtn };
}

function ensureModal(): ProjectModal {
  if (!modal) modal = buildModal();
  return modal;
}

// A candidate parent must be top-level and have no children of its own —
// same one-level rule enforced server-side in lib/db.ts's
// assertEligibleParent/setProjectParent — except the project's own current
// parent always stays an option even if it fails that check by now (e.g.
// it gained a second child since), or the select would silently show "Top
// level" while the data still says otherwise.
function populateParentOptions(m: ProjectModal, projectId: number, currentParentId: number | null): void {
  m.parentSelect.innerHTML = '';
  const topOption = document.createElement('option');
  topOption.value = '';
  topOption.textContent = 'Top level';
  m.parentSelect.append(topOption);

  const childCounts = new Map<number, number>();
  for (const p of PROJECTS) {
    if (p.parentProjectId != null) childCounts.set(p.parentProjectId, (childCounts.get(p.parentProjectId) ?? 0) + 1);
  }

  for (const p of PROJECTS) {
    if (p.isInbox || p.id === projectId) continue;
    const isCurrentParent = p.id === currentParentId;
    if (p.parentProjectId != null && !isCurrentParent) continue;
    if (childCounts.has(p.id) && !isCurrentParent) continue;
    const opt = document.createElement('option');
    opt.value = String(p.id);
    opt.textContent = p.name;
    m.parentSelect.append(opt);
  }
  m.parentSelect.value = currentParentId != null ? String(currentParentId) : '';

  // One level only — a project with children of its own structurally can't
  // become a child, so there's nothing useful to offer here.
  m.parentField.hidden = childCounts.has(projectId);
}

function openProjectModal(li: HTMLElement): void {
  const link = li.querySelector<HTMLAnchorElement>('a.nav-item');
  const nameEl = link?.querySelector<HTMLElement>('.truncate');
  if (!link || !nameEl) return;
  const m = ensureModal();
  pendingClose?.();

  activeLi = li;
  const projectId = Number(li.dataset.projectId);
  const type = li.dataset.projectType === 'private' ? 'private' : 'work';
  const parentId = li.dataset.parentId ? Number(li.dataset.parentId) : null;

  m.nameInput.value = nameEl.textContent ?? '';
  m.workBtn.setAttribute('aria-pressed', String(type === 'work'));
  m.privateBtn.setAttribute('aria-pressed', String(type === 'private'));
  populateParentOptions(m, projectId, parentId);
  m.saveBtn.disabled = false;
  m.deleteBtn.disabled = false;

  m.dialog.showModal();
  m.nameInput.focus();
  m.nameInput.select();
}

// Exported per-element so a project created without a reload can be wired
// up individually — re-running the bulk attach would double-bind existing
// rows (see sidebar.ts's create-project handler).
export function attachProjectEdit(button: HTMLButtonElement): void {
  button.addEventListener('click', () => {
    const li = button.closest<HTMLElement>('li');
    if (li) openProjectModal(li);
  });
}

export function attachProjectEdits(): void {
  document.querySelectorAll<HTMLButtonElement>('.project-edit').forEach(attachProjectEdit);
}

attachProjectEdits();
