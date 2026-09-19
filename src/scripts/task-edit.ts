import { actions } from 'astro:actions';

// A due-date change can move a task into a different day group (Today's
// "overdue" vs "due today", or a different Upcoming heading) and a priority
// change re-sorts it — reloading on either is the simplest way to stay
// correct across all three views, rather than re-deriving each page's
// grouping in JS. A title-only edit can't affect grouping, so that one
// updates in place instead.
function openEditor(li: HTMLElement): void {
  const main = li.querySelector<HTMLElement>('.task-main');
  const titleEl = main?.querySelector<HTMLElement>('.task-title');
  if (!main || !titleEl || li.querySelector('.task-edit-form')) return;

  const taskId = Number(li.dataset.taskId);
  const currentTitle = titleEl.textContent ?? '';
  const currentDue = li.dataset.dueDate || '';
  const currentPriority = li.dataset.priority || '4';

  const form = document.createElement('form');
  form.className = 'composer task-edit-form mt-1';

  const titleInput = document.createElement('input');
  titleInput.className = 'flex-1';
  titleInput.value = currentTitle;
  titleInput.required = true;

  const dueInput = document.createElement('input');
  dueInput.type = 'date';
  dueInput.value = currentDue;

  const prioritySelect = document.createElement('select');
  for (const p of [4, 3, 2, 1]) {
    const opt = document.createElement('option');
    opt.value = String(p);
    opt.textContent = `P${p}`;
    opt.selected = String(p) === currentPriority;
    prioritySelect.append(opt);
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--submit';
  saveBtn.title = 'Save';
  saveBtn.textContent = '✓';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost';
  cancelBtn.title = 'Cancel';
  cancelBtn.textContent = '✕';

  form.append(titleInput, dueInput, prioritySelect, saveBtn, cancelBtn);

  main.hidden = true;
  li.insertBefore(form, main.nextSibling);
  titleInput.focus();

  const restore = () => {
    form.remove();
    main.hidden = false;
  };

  cancelBtn.addEventListener('click', restore);
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') restore();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    const dueChanged = dueInput.value !== currentDue;
    const priorityChanged = prioritySelect.value !== currentPriority;
    const { error } = await actions.updateTask({
      taskId,
      title: titleInput.value,
      dueDate: dueInput.value || null,
      priority: Number(prioritySelect.value),
    });
    if (error) {
      alert(error.message);
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      return;
    }
    // A due-date or priority change can move the task into a different day
    // group or section order — reload to stay correct. A title-only edit
    // can't, so update in place instead of flashing the whole page.
    if (dueChanged || priorityChanged) {
      location.reload();
      return;
    }
    titleEl.textContent = titleInput.value;
    restore();
  });
}

export function attachTaskEdit(titleEl: HTMLElement): void {
  titleEl.addEventListener('click', () => {
    const li = titleEl.closest<HTMLElement>('li');
    if (li) openEditor(li);
  });
}

export function attachTaskEdits(): void {
  document.querySelectorAll<HTMLElement>('.task-title').forEach(attachTaskEdit);
}

attachTaskEdits();
