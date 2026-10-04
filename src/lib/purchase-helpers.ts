import "server-only";

export function addDays(days: number, from: Date = new Date()) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
