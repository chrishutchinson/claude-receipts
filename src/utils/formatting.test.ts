import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDuration,
} from "./formatting.js";

describe("formatCurrency", () => {
  it("formats whole dollars with two decimals", () => {
    expect(formatCurrency(5)).toBe("$5.00");
  });

  it("rounds to two decimal places", () => {
    expect(formatCurrency(1.2345)).toBe("$1.23");
    expect(formatCurrency(1.236)).toBe("$1.24");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats sub-cent values", () => {
    expect(formatCurrency(0.001)).toBe("$0.00");
    expect(formatCurrency(0.006)).toBe("$0.01");
  });
});

describe("formatNumber", () => {
  it("inserts thousand separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("leaves small numbers unchanged", () => {
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatDateTime", () => {
  const date = new Date("2026-05-16T14:30:45Z");

  it("formats with system timezone when none provided", () => {
    const result = formatDateTime(date);
    // Format is yyyy-MM-dd HH:mm:ss — exact value depends on TZ, just shape-check
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("formats in a specific timezone", () => {
    const result = formatDateTime(date, "America/New_York");
    expect(result).toBe("2026-05-16 10:30:45 EDT");
  });

  it("falls back to system format on invalid timezone", () => {
    const result = formatDateTime(date, "Not/A/Timezone");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(result).not.toContain("EDT");
  });
});

describe("formatDuration", () => {
  const base = new Date("2026-01-01T00:00:00Z");

  it("formats seconds-only durations", () => {
    const end = new Date(base.getTime() + 45 * 1000);
    expect(formatDuration(base, end)).toBe("45s");
  });

  it("formats minute durations with remainder seconds", () => {
    const end = new Date(base.getTime() + (5 * 60 + 12) * 1000);
    expect(formatDuration(base, end)).toBe("5m 12s");
  });

  it("formats hour durations with remainder minutes (drops seconds)", () => {
    const end = new Date(base.getTime() + (2 * 3600 + 30 * 60 + 45) * 1000);
    expect(formatDuration(base, end)).toBe("2h 30m");
  });

  it("handles zero duration", () => {
    expect(formatDuration(base, base)).toBe("0s");
  });
});
