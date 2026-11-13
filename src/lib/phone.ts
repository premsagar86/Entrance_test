/**
 * Phone numbers are compared by digits only, so "+91 98765-43210" and "919876543210" are the same number.
 * Returns the canonical digit string, or null if it is not 8-15 digits (optionally prefixed with +).
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{8,15}$/.test(cleaned)) return null;
  return cleaned.replace(/^\+/, "");
}
