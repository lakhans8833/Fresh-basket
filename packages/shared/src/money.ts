/** All money values are integers in paise (1 INR = 100 paise). */
export type Paise = number;

const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹60 for whole rupees, ₹31.20 otherwise (never "₹31.2"). */
export function formatINR(paise: Paise): string {
  return (Number.isInteger(paise) && paise % 100 === 0 ? inrWhole : inrPaise).format(paise / 100);
}

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}
