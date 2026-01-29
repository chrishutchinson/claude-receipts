import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Format a number as currency (USD)
 */
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

/**
 * Format a date with timezone
 */
export function formatDateTime(date: Date, timezone?: string): string {
  if (timezone) {
    try {
      return formatInTimeZone(date, timezone, "yyyy-MM-dd HH:mm:ss zzz");
    } catch {
      // Fallback if timezone is invalid
    }
  }

  return format(date, "yyyy-MM-dd HH:mm:ss");
}

/**
 * Calculate duration between two dates
 */
export function formatDuration(start: Date, end: Date): string {
  const durationMs = end.getTime() - start.getTime();
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${seconds}s`;
}
