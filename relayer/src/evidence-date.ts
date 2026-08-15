const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_UTC_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

export function isIsoCalendarDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;

  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateIsoDateField(
  errors: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
): void {
  const value = fields.get(field) ?? '';
  if (value.trim().length > 0 && !isIsoCalendarDate(value)) {
    errors.push(`${section}: ${field} must use YYYY-MM-DD`);
  }
}

export function isIsoUtcTimestamp(value: string): boolean {
  const match = ISO_UTC_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (year < 1000 || hour > 23 || minute > 59 || second > 59) return false;

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

export function validateIsoUtcTimestampField(
  errors: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
): void {
  const value = fields.get(field) ?? '';
  if (value.trim().length > 0 && !isIsoUtcTimestamp(value)) {
    errors.push(`${section}: ${field} must use YYYY-MM-DDTHH:mm:ssZ`);
  }
}
