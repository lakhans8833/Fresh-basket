/** Indian PIN codes: 6 digits, first digit 1-9. */
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export function normalizePincode(input: string): string {
  return input.replace(/\s+/g, "");
}

export function isValidPincode(input: string): boolean {
  return PINCODE_REGEX.test(normalizePincode(input));
}

/** Indian mobile numbers: 10 digits starting 6-9, optional +91 / 0 prefix. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^0-9]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isValidIndianMobile(input: string): boolean {
  return /^[6-9][0-9]{9}$/.test(normalizePhone(input));
}
