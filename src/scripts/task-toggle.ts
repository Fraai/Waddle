import { actions } from 'astro:actions';
import { bumpOpenCount } from './open-count';

function paint(checkbox: HTMLInputElement): void {
  const title = checkbox.nextElementSibling;
  if (title?.classList.contains('task-title')) {
    title.toggleAttribute('data-done', checkbox.checked);
  }
}

// Exported per-element so newly-inserted rows (added without a reload) can
// be wired up individually — re-running the bulk attach below would give
// every pre-existing checkbox a second listener.
export function attachTaskToggle(checkbox: HTMLInputElement): void {
  checkbox.addEventListener('change', async () => {
    const taskId = Number(checkbox.dataset.taskId);
    const row = checkbox.closest<HTMLElement>('li');
    // Top-level tasks (class task-row) are the ones the header counts —
    // subtasks (class subtask) aren't. Both wrap their checkbox in the same
    // .task-main div, so that alone can't tell them apart.
    const countable = row?.classList.contains('task-row') ?? false;
    // Today/Upcoming only ever query *open* tasks — once one is done it no
    // longer belongs in that list at all, so hide the row instead of just
    // striking it through. Project pages opt into the same behaviour for
    // top-level tasks (done ones move to the Completed disclosure on next
    // load) but keep subtasks struck-through in place, matching `countable`
    // above — both are true only for a .task-row, never a .subtask.
    const removeOnDone = countable && row?.closest('[data-remove-done]') != null;

    if (removeOnDone && checkbox.checked) {
      // Fade first, collapse out of the layout once toggleTaskDone below
      // resolves — by then the fade has almost always already finished
      // (network round-trip outlasts the --fast transition), so there's no
      // visible jump.
      row?.classList.add('row-leave');
    } else {
      paint(checkbox);
    }
    if (countable) bumpOpenCount(checkbox.checked ? -1 : 1);

    const { error, data } = await actions.toggleTaskDone({ taskId });
    if (error) {
      checkbox.checked = !checkbox.checked;
      if (removeOnDone) {
        row?.classList.remove('row-leave');
      } else {
        paint(checkbox);
      }
      if (countable) bumpOpenCount(checkbox.checked ? -1 : 1);
      alert(error.message);
      return;
    }
    // A repeating task's next occurrence was just created server-side —
    // simplest to reload than to work out where (if anywhere) it belongs in
    // whatever list is currently on screen.
    if (data?.nextOccurrenceCreated) {
      location.reload();
      return;
    }
    if (removeOnDone && row) row.hidden = true;
  });
}

export function attachTaskToggles(): void {
  document.querySelectorAll<HTMLInputElement>('.task-toggle').forEach(attachTaskToggle);
}

attachTaskToggles();
