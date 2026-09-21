// Keyboard equivalent to this app's drag-and-drop reordering — SortableJS
// has no built-in keyboard support, so a drag-only list is unusable for a
// keyboard-only user. "Move up"/"move down" buttons swap DOM position with
// the nearest matching sibling; the caller then re-reads the list and
// persists the new order the same way a drag's onEnd already does.

const UP_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4" /></svg>';
const DOWN_ICON =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4" /></svg>';

export function buildMoveButton(direction: 'up' | 'down', label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `move-btn move-${direction} icon-btn`;
  btn.title = `Move ${label} ${direction}`;
  btn.innerHTML = `${direction === 'up' ? UP_ICON : DOWN_ICON}<span class="sr-only">Move ${label} ${direction}</span>`;
  return btn;
}

/** Sets each item's move buttons disabled at the start/end of its group —
 * call after every reorder (including on load) so a button that can no
 * longer do anything doesn't stay focusable. `groupKey` returns the same
 * value for items that reorder among each other (e.g. a project's
 * parent id); omit it for a flat list where everything is one group. */
export function refreshMoveButtons(list: HTMLElement, groupKey: (el: HTMLElement) => string = () => ''): void {
  const groups = new Map<string, HTMLElement[]>();
  for (const child of [...list.children] as HTMLElement[]) {
    const key = groupKey(child);
    const group = groups.get(key) ?? [];
    group.push(child);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.forEach((item, i) => {
      const up = item.querySelector<HTMLButtonElement>('.move-up');
      const down = item.querySelector<HTMLButtonElement>('.move-down');
      if (up) up.disabled = i === 0;
      if (down) down.disabled = i === group.length - 1;
    });
  }
}

/** Swaps `item` with the nearest sibling (within item.parentElement) that
 * matches `isSibling`, skipping past any that don't. Safe only when the
 * skipped nodes aren't themselves part of a group that would be split apart
 * by the jump — true for every flat list this is used on (favorites,
 * sections, tasks within one list). The nested project list needs its own
 * block-aware move (see sidebar.ts's moveProjectBlock) since a project's
 * children have to travel with it. Returns false if already first/last. */
export function swapWithSibling(
  item: HTMLElement,
  direction: 'up' | 'down',
  isSibling: (el: Element) => boolean,
): boolean {
  const parent = item.parentElement;
  if (!parent) return false;
  let sibling = direction === 'up' ? item.previousElementSibling : item.nextElementSibling;
  while (sibling && !isSibling(sibling)) {
    sibling = direction === 'up' ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
  if (!sibling) return false;
  if (direction === 'up') parent.insertBefore(item, sibling);
  else parent.insertBefore(sibling, item);
  return true;
}
