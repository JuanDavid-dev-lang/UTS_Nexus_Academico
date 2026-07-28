/**
 * Display formatting.
 *
 * Every number the teacher reads passes through here, so a grade is rendered
 * the same way on the dashboard, in the grade sheet and in the AI panel.
 */

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const numberFormatter = new Intl.NumberFormat('es-CO');

/** Grades are on a 0.0-5.0 scale and always shown with two decimals. */
export function formatGrade(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(2);
}

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return numberFormatter.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

/** "hace 5 min", "ayer" - relative time reads faster in an activity feed. */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'hace un momento';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 172800) return 'ayer';
  if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)} días`;
  return formatDate(date);
}

/** Two-letter initials for avatars. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

/** ISO date (yyyy-mm-dd) for <input type="date"> and API filters. */
export function toIsoDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Current academic period, e.g. "2026-1".
 *
 * UTS runs two periods per year, split at July.
 */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth() < 6 ? 1 : 2}`;
}

/** Recent periods, newest first - used to populate period selectors. */
export function recentPeriods(count = 6, now: Date = new Date()): string[] {
  const periods: string[] = [];
  let year = now.getFullYear();
  let half = now.getMonth() < 6 ? 1 : 2;

  for (let index = 0; index < count; index += 1) {
    periods.push(`${year}-${half}`);
    if (half === 1) {
      half = 2;
      year -= 1;
    } else {
      half = 1;
    }
  }
  return periods;
}
