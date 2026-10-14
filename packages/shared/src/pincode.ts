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

/*
 * State for a PIN code, from the first three digits (India Post sorting districts).
 * Only ranges that belong to a single state are listed; mixed ranges (e.g. Bihar/Jharkhand, UP/Uttarakhand
 * border districts, Chandigarh/Mohali, Puducherry pockets) return null so a correct address is never rejected.
 */
const PIN_STATE_RANGES: [number, number, string][] = [
  [110, 110, "Delhi"],
  [121, 136, "Haryana"],
  [140, 152, "Punjab"],
  [171, 177, "Himachal Pradesh"],
  [201, 243, "Uttar Pradesh"],
  [250, 261, "Uttar Pradesh"],
  [270, 285, "Uttar Pradesh"],
  [301, 345, "Rajasthan"],
  [360, 395, "Gujarat"],
  [400, 402, "Maharashtra"],
  [403, 403, "Goa"],
  [404, 445, "Maharashtra"],
  [450, 488, "Madhya Pradesh"],
  [490, 497, "Chhattisgarh"],
  [500, 509, "Telangana"],
  [515, 535, "Andhra Pradesh"],
  [560, 591, "Karnataka"],
  [600, 604, "Tamil Nadu"],
  [606, 606, "Tamil Nadu"],
  [608, 608, "Tamil Nadu"],
  [610, 643, "Tamil Nadu"],
  [670, 681, "Kerala"],
  [683, 695, "Kerala"],
  [700, 736, "West Bengal"],
  [738, 743, "West Bengal"],
  [751, 770, "Odisha"],
  [781, 788, "Assam"],
];

export function stateForPincode(input: string): string | null {
  const pin = normalizePincode(input);
  if (!PINCODE_REGEX.test(pin)) return null;
  const p = Number(pin.slice(0, 3));
  return PIN_STATE_RANGES.find(([lo, hi]) => p >= lo && p <= hi)?.[2] ?? null;
}

const STATE_ALIASES: Record<string, string> = {
  newdelhi: "delhi", nctofdelhi: "delhi", nctdelhi: "delhi", dl: "delhi",
  hr: "haryana", pb: "punjab", hp: "himachalpradesh", up: "uttarpradesh", rj: "rajasthan",
  gj: "gujarat", mh: "maharashtra", ga: "goa", mp: "madhyapradesh", cg: "chhattisgarh", chattisgarh: "chhattisgarh",
  ts: "telangana", tg: "telangana", ap: "andhrapradesh", ka: "karnataka", tn: "tamilnadu", kl: "kerala",
  wb: "westbengal", od: "odisha", or: "odisha", orissa: "odisha", as: "assam",
};
const stateKey = (s: string) => {
  const k = s.toLowerCase().replace(/[^a-z]/g, "");
  return STATE_ALIASES[k] ?? k;
};

/** True when the typed state matches the PIN's state, or when we can't tell the PIN's state. */
export function stateMatchesPincode(state: string, pincode: string): boolean {
  const expected = stateForPincode(pincode);
  return !expected || stateKey(state) === stateKey(expected);
}

export function pincodeStateMessage(pincode: string): string {
  return `PIN ${normalizePincode(pincode)} is in ${stateForPincode(pincode)}. Please check the PIN code or state.`;
}
