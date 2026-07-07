/**
 * Date formatting for the thread list (user-stories/typescript_email_ui.md):
 * relative time-of-day for the current day, a plain date otherwise, computed
 * from the model's epoch-ms numbers against an injectable "now".
 */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local YYYY-MM-DD — deterministic across machines for a given local time. */
export function formatYmd(dateMs: number): string {
  const date = new Date(dateMs);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "14:05" when the message arrived today, "2024-05-03" otherwise. */
export function formatThreadDate(dateMs: number, nowMs: number): string {
  const date = new Date(dateMs);
  const now = new Date(nowMs);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : formatYmd(dateMs);
}
