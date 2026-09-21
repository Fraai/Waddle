// Display-only helpers. Date logic (what counts as "today") lives in dates.ts.

// Every deployment has one team in one place — the default matches this
// instance's (Fraai Agency, Belgium); a self-hoster sets DATE_LOCALE to
// override it, see CLAUDE.md / .env.example.
export const DEFAULT_DATE_LOCALE = 'en-GB';

export function formatDate(iso: string, locale: string = DEFAULT_DATE_LOCALE): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateHeading(iso: string, today: string, locale: string = DEFAULT_DATE_LOCALE): string {
  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);
  if (iso === tomorrowISO) return `Tomorrow · ${formatDate(iso, locale)}`;
  return formatDate(iso, locale);
}

export function formatWeekday(iso: string, locale: string = DEFAULT_DATE_LOCALE): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { weekday: 'short' });
}

export function formatDayMonth(iso: string, locale: string = DEFAULT_DATE_LOCALE): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
