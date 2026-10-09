/**
 * Due dates are calendar days, stored as local YYYY-MM-DD strings. Never round-trip them through
 * `new Date('YYYY-MM-DD')`: that parses as UTC midnight and lands on the previous day west of UTC.
 */

export function toISODate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromISODate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export type DueStatus = 'overdue' | 'today' | 'upcoming';

/** Human label for a due date relative to `today`, e.g. "Today", "Tomorrow", "Mon, Oct 12". */
export function describeDue(iso: string, today = new Date()): { label: string; status: DueStatus } {
  const due = fromISODate(iso);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((due.getTime() - start.getTime()) / 86_400_000);

  if (days === 0) return { label: 'Today', status: 'today' };
  if (days === 1) return { label: 'Tomorrow', status: 'upcoming' };
  if (days === -1) return { label: 'Yesterday', status: 'overdue' };

  const sameYear = due.getFullYear() === start.getFullYear();
  const label = due.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return { label, status: days < 0 ? 'overdue' : 'upcoming' };
}
