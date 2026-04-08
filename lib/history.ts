const DEFAULT_HISTORY_VALUES = new Set(["", "default", "none", "n/a"]);

export function formatRequestedHistoryWindow(yearsOfChecking?: string | null) {
  const rawValue = String(yearsOfChecking ?? "").trim();
  if (!rawValue) {
    return null;
  }

  const normalizedValue = rawValue.toLowerCase();
  if (DEFAULT_HISTORY_VALUES.has(normalizedValue)) {
    return null;
  }

  const numericYearMatch = rawValue.match(/^(\d+)\s*(?:years?|yrs?)?$/i);
  if (numericYearMatch) {
    const yearCount = Number.parseInt(numericYearMatch[1], 10);
    if (Number.isFinite(yearCount) && yearCount > 0) {
      return `${yearCount} ${yearCount === 1 ? "year" : "years"} from present`;
    }
  }

  if (/from\s+present|from\s+now/i.test(rawValue)) {
    return rawValue;
  }

  if (/year/i.test(rawValue)) {
    return `${rawValue} from present`;
  }

  return rawValue;
}
