import Sortable from 'sortablejs';
import { actions } from 'astro:actions';
// Importing runs task-toggle's/task-delete's/task-edit's/task-create's own
// setup — don't re-attach their listeners here or every element gets two.
import './task-toggle';
import './task-delete';
import './task-edit';
import './task-create';

document.querySelectorAll<HTMLUListElement>('.week-day ul.task-list[data-date]').forEach((list) => {
  new Sortable(list, {
    group: 'week',
    animation: 150,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    // Native HTML5 drag-and-drop (SortableJS's default) is unreliable on
    // touch browsers — this is the one drag interaction in the app that has
    // to work on a phone, since rescheduling by dragging is the point of
    // this view. The fallback uses pointer events instead, consistently.
    forceFallback: true,
    // No within-day reordering — a day has no real position/order to keep
    // (tasks here span every project), so only a cross-day drop, which
    // reassigns due_date, does anything persistent.
    sort: false,
    onEnd: async (event) => {
      const item = event.item;
      const newDate = event.to.dataset.date;
      const oldDate = item.dataset.dueDate;
      if (!newDate || newDate === oldDate) return;

      const taskId = Number(item.dataset.taskId);
      item.dataset.dueDate = newDate;

      const { error } = await actions.updateTask({ taskId, dueDate: newDate });
      if (error) {
        alert(error.message);
        location.reload();
      }
    },
  });
});
