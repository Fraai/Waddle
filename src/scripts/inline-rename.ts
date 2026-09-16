/**
 * Swaps a display element for a text-input form, in place, for renaming a
 * project or section. `displayEl` is hidden (not removed) so restoring it
 * on cancel/error needs no re-render. `hideWhileEditing` (e.g. the row's
 * rename/delete icon buttons) is hidden alongside it — otherwise those stay
 * visible next to the form and, in the 256px sidebar, push the row wider
 * than its container.
 */
export function startInlineRename(opts: {
  container: HTMLElement;
  displayEl: HTMLElement;
  currentValue: string;
  hideWhileEditing?: HTMLElement[];
  save: (value: string) => Promise<{ error?: { message: string } | null }>;
  onSaved: (value: string) => void;
}): void {
  const { container, displayEl, currentValue, hideWhileEditing = [], save, onSaved } = opts;
  if (container.querySelector(':scope > .inline-rename-form')) return;

  const form = document.createElement('form');
  form.className = 'inline-rename-form flex min-w-0 flex-1 items-center gap-1';

  const input = document.createElement('input');
  input.className = 'field min-w-0 flex-1';
  input.value = currentValue;
  input.required = true;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--submit';
  saveBtn.title = 'Save';
  saveBtn.textContent = '✓';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--submit';
  cancelBtn.title = 'Cancel';
  cancelBtn.textContent = '✕';

  form.append(input, saveBtn, cancelBtn);

  displayEl.hidden = true;
  for (const el of hideWhileEditing) el.hidden = true;
  container.insertBefore(form, displayEl);
  input.focus();
  input.select();

  const restore = () => {
    form.remove();
    displayEl.hidden = false;
    for (const el of hideWhileEditing) el.hidden = false;
  };

  cancelBtn.addEventListener('click', restore);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') restore();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value || value === currentValue) {
      restore();
      return;
    }
    saveBtn.disabled = true;
    const { error } = await save(value);
    if (error) {
      alert(error.message);
      saveBtn.disabled = false;
      return;
    }
    onSaved(value);
    restore();
  });
}
