import { fromISODate, toISODate } from './dates';
import type { RepeatUnit } from './todos';

/**
 * Repeating todos follow their due date: each time one reopens, its due date moves on to the next
 * occurrence. Dates are local YYYY-MM-DD strings, which compare correctly as plain strings.
 */

/** The date in `iso`'s month on `day`, or on the month's last day if it's shorter (31 → Feb 28). */
export function onDay(iso: string, day: number) {
  const date = fromISODate(iso);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return toISODate(new Date(date.getFullYear(), date.getMonth(), Math.min(day, lastDay)));
}

/** `iso` moved on by one interval. Monthly repeats land on `day` (see onDay). */
export function addInterval(iso: string, every: number, unit: RepeatUnit, day: number) {
  const date = fromISODate(iso);
  if (unit === 'month') return onDay(toISODate(new Date(date.getFullYear(), date.getMonth() + every, 1)), day);
  date.setDate(date.getDate() + every * (unit === 'week' ? 7 : 1));
  return toISODate(date);
}

type Repeat = {
  dueDate: string | null;
  /** Local date the todo was completed. */
  doneOn: string;
  every: number;
  unit: RepeatUnit;
  /** Day of the month for monthly repeats; defaults to the due (or done) date's day. */
  day: number | null;
};

/**
 * When a completed repeating todo comes back, and its due date then.
 * With a due date: the first occurrence after both the due date and the day it was done, so doing
 * it early or late doesn't shift the schedule; occurrences already missed by `today` are skipped.
 * Without one: one interval after the day it was done.
 */
export function nextRepeat({ dueDate, doneOn, every, unit, day }: Repeat, today: string) {
  const step = (iso: string) => addInterval(iso, every, unit, day ?? fromISODate(dueDate ?? doneOn).getDate());
  if (!dueDate) return { reopenOn: step(doneOn), dueDate: null };

  const after = dueDate > doneOn ? dueDate : doneOn;
  let next = step(dueDate);
  while (next <= after) next = step(next);
  while (step(next) <= today) next = step(next);
  return { reopenOn: next, dueDate: next };
}
