const DURATION_MS = 5000;

let container: HTMLElement | undefined;
let hideTimer: number | undefined;
let pendingUndo: (() => void) | undefined;

function ensureContainer(): HTMLElement {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

function dismiss(): void {
  clearTimeout(hideTimer);
  hideTimer = undefined;
  pendingUndo = undefined;
  if (container) container.innerHTML = '';
}

export function showToast(message: string, onUndo?: () => void): void {
  const el = ensureContainer();
  clearTimeout(hideTimer);
  pendingUndo = onUndo;
  el.innerHTML = '';

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  if (onUndo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-undo';
    button.textContent = 'Undo';
    button.addEventListener('click', () => {
      onUndo();
      dismiss();
    });
    toast.appendChild(button);
  }

  el.appendChild(toast);
  hideTimer = window.setTimeout(dismiss, DURATION_MS);
}

// Keyboard undo (Cmd/Ctrl+Z) while a toast with an undo action is showing —
// skipped inside text fields so it doesn't fight the browser's own text undo.
document.addEventListener('keydown', (e) => {
  if (!pendingUndo) return;
  if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  e.preventDefault();
  const undo = pendingUndo;
  dismiss();
  undo();
});
