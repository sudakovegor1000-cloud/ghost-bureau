const DAY = 24 * 60 * 60 * 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Строгая проверка YYYY-MM-DD (отсекает 2026-02-31) */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Сколько дней от `from` до `to` (отрицательное — уже прошло) */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

export function formatDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function deadlineText(today: string, deadline: string): string {
  const d = daysBetween(today, deadline);
  if (d < 0) return `просрочен на ${-d} дн.`;
  if (d === 0) return 'сегодня!';
  return `через ${d} дн.`;
}
