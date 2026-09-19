import Sortable from 'sortablejs';
import { actions } from 'astro:actions';
import { startInlineRename } from './inline-rename';

const DELETE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg><span class="sr-only">Delete project</span>';
const RENAME_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11.3 2.7a1.2 1.2 0 0 1 1.7 1.7L5.6 12l-2.4.7.7-2.4z" /></svg><span class="sr-only">Rename project</span>';
const LOCK_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="7" width="9" height="6" rx="1.3" /><path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7" /></svg><span class="sr-only">Toggle private/work</span>';
const BRIEFCASE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5.3" width="12" height="7.5" rx="1.3" /><path d="M6 5.3V4.3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M2 9h12" /></svg><span class="sr-only">Toggle private/work</span>';

// Same spacing as the server's projectHue() in AppLayout.astro — golden-angle
// hue steps give every project a distinct, stable colour without storing one.
const projectHue = (id: number) => (id * 137.5) % 360;

// Desktop sidebar collapse — separate from the mobile drawer's checkbox,
// which stays CSS-only. The inline <script> in AppLayout.astro's <head>
// already applied a stored preference before paint; this just handles
// clicks from here on.
const sidebarEl = document.querySelector<HTMLElement>('.sidebar');
const collapseBtn = document.getElementById('sidebar-collapse');
const expandBtn = document.getElementById('sidebar-expand');
// The collapsed *preference* is width-independent, but it only visually
// applies at md+ (see global.css) — below that the mobile drawer takes
// over, so inert must track "collapsed AND desktop", not collapsed alone,
// or a desktop-collapsed sidebar would also lock out the mobile drawer.
const desktopMQ = window.matchMedia('(min-width: 768px)');

function syncSidebarInert(): void {
  if (!sidebarEl) return;
  sidebarEl.inert = document.documentElement.dataset.sidebarCollapsed === 'true' && desktopMQ.matches;
}

function setSidebarCollapsed(collapsed: boolean, focusTarget?: HTMLElement | null): void {
  document.documentElement.dataset.sidebarCollapsed = String(collapsed);
  // inert both hides it from assistive tech and blocks keyboard focus from
  // landing in a panel that's visually gone — aria-hidden alone wouldn't
  // stop Tab from reaching it, since pointer-events:none only blocks clicks.
  syncSidebarInert();
  try {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  } catch {}
  focusTarget?.focus();
}

// Apply whatever the head script already decided before this ran, and keep
// it in sync if the window crosses the desktop breakpoint afterwards.
syncSidebarInert();
desktopMQ.addEventListener('change', syncSidebarInert);

collapseBtn?.addEventListener('click', () => setSidebarCollapsed(true, expandBtn));
expandBtn?.addEventListener('click', () => setSidebarCollapsed(false, collapseBtn));

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    const collapsed = document.documentElement.dataset.sidebarCollapsed === 'true';
    setSidebarCollapsed(!collapsed, collapsed ? collapseBtn : expandBtn);
  }
});

// Private/work filter — a per-browser preference (see the inline <script>
// in AppLayout.astro's <head>, which applies a stored value before paint).
// Filtering itself is pure CSS keyed off data-task-filter; this just keeps
// the three buttons' pressed state in sync and persists a click.
const filterButtons = document.querySelectorAll<HTMLButtonElement>('.filter-toggle-btn');

function applyTaskFilterButtons(filter: string): void {
  filterButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.filter === filter));
  });
}

function setTaskFilter(filter: 'all' | 'work' | 'private'): void {
  if (filter === 'all') delete document.documentElement.dataset.taskFilter;
  else document.documentElement.dataset.taskFilter = filter;
  applyTaskFilterButtons(filter);
  try {
    localStorage.setItem('taskFilter', filter);
  } catch {}
}

applyTaskFilterButtons(document.documentElement.dataset.taskFilter ?? 'all');
filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => setTaskFilter(btn.dataset.filter as 'all' | 'work' | 'private'));
});

// A project's private/work badge — always visible (unlike rename/delete),
// since the point is to see it at a glance, and clicking it just flips the
// type in place. Works for both a project <li> and the Inbox's own row,
// which both carry data-project-id on their own container.
function attachProjectTypeBadge(button: HTMLButtonElement): void {
  button.addEventListener('click', async () => {
    const projectId = Number(button.dataset.projectId);
    const current = button.dataset.type === 'private' ? 'private' : 'work';
    const next = current === 'private' ? 'work' : 'private';
    const row = button.closest<HTMLElement>('[data-project-id]');

    const apply = (type: 'private' | 'work') => {
      button.dataset.type = type;
      button.innerHTML = type === 'private' ? LOCK_ICON : BRIEFCASE_ICON;
      button.title = type === 'private' ? 'Private — click to mark as Work' : 'Work — click to mark as Private';
      if (row) row.dataset.projectType = type;
    };

    apply(next);
    const { error } = await actions.setProjectType({ projectId, type: next });
    if (error) {
      apply(current);
      alert(error.message);
    }
  });
}

document.querySelectorAll<HTMLButtonElement>('.project-type-badge').forEach(attachProjectTypeBadge);

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

// Exported per-element so a project created without a reload can be wired up
// individually — re-running the bulk attach would double-bind existing rows.
function attachProjectDelete(button: HTMLButtonElement): void {
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
}

function attachProjectRename(button: HTMLButtonElement): void {
  button.addEventListener('click', () => {
    const projectId = Number(button.dataset.projectId);
    const li = button.closest<HTMLElement>('li');
    const link = li?.querySelector<HTMLAnchorElement>('a.nav-item');
    const nameEl = link?.querySelector<HTMLElement>('.truncate');
    const deleteBtn = li?.querySelector<HTMLButtonElement>('.project-delete');
    if (!li || !link || !nameEl) return;
    const onThisProject = location.pathname === `/app/projects/${projectId}`;

    startInlineRename({
      container: li,
      displayEl: link,
      hideWhileEditing: [button, ...(deleteBtn ? [deleteBtn] : [])],
      currentValue: nameEl.textContent ?? '',
      save: (name) => actions.renameProject({ projectId, name }),
      onSaved: (name) => {
        nameEl.textContent = name;
        if (onThisProject) {
          const heading = document.querySelector<HTMLElement>('h1.page-title');
          if (heading) heading.textContent = name;
        }
      },
    });
  });
}

document.querySelectorAll<HTMLButtonElement>('.project-delete').forEach(attachProjectDelete);
document.querySelectorAll<HTMLButtonElement>('.project-rename').forEach(attachProjectRename);

const newProjectForm = document.getElementById('new-project')?.closest('form');
newProjectForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = newProjectForm.querySelector<HTMLInputElement>('#new-project');
  if (!input || !list) return;

  // Snapshot before disabling — a disabled control is excluded from FormData.
  const formData = new FormData(newProjectForm);
  input.disabled = true;
  const { data: project, error } = await actions.createProject(formData);
  input.disabled = false;
  if (error || !project) {
    alert(error?.message ?? 'Could not create project');
    return;
  }

  const li = document.createElement('li');
  li.dataset.projectId = String(project.id);
  li.dataset.projectType = project.type;
  li.className = 'flex items-center gap-1';

  const link = document.createElement('a');
  link.href = `/app/projects/${project.id}`;
  link.className = 'nav-item flex-1 min-w-0';
  link.dataset.astroPrefetch = '';

  const dot = document.createElement('span');
  dot.className = 'project-dot';
  dot.style.setProperty('--dot', `hsl(${projectHue(project.id)} 62% 52%)`);

  const name = document.createElement('span');
  name.className = 'truncate min-w-0';
  name.textContent = project.name;

  link.append(dot, name);

  const typeBadge = document.createElement('button');
  typeBadge.type = 'button';
  typeBadge.className = 'project-type-badge';
  typeBadge.dataset.projectId = String(project.id);
  typeBadge.dataset.type = project.type;
  typeBadge.title = project.type === 'private' ? 'Private — click to mark as Work' : 'Work — click to mark as Private';
  typeBadge.innerHTML = project.type === 'private' ? LOCK_ICON : BRIEFCASE_ICON;

  const renameBtn = document.createElement('button');
  renameBtn.className = 'project-rename icon-btn';
  renameBtn.dataset.projectId = String(project.id);
  renameBtn.title = `Rename ${project.name}`;
  renameBtn.innerHTML = RENAME_ICON;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'project-delete icon-btn';
  deleteBtn.dataset.projectId = String(project.id);
  deleteBtn.title = `Delete ${project.name}`;
  deleteBtn.innerHTML = DELETE_ICON;

  li.append(link, typeBadge, renameBtn, deleteBtn);
  list.append(li);
  attachProjectTypeBadge(typeBadge);
  attachProjectRename(renameBtn);
  attachProjectDelete(deleteBtn);

  input.value = '';
  input.focus();
});
