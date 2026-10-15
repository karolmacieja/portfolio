import type { VatRate } from "./types";

/** Net and VAT parts of a gross amount (grosze), rounded half away from zero like Polish invoices. */
export function splitGross(grossAmount: number, vatRate: VatRate): { netAmount: number; vatAmount: number } {
  const percent = Number(vatRate);
  if (!Number.isFinite(percent) || percent === 0) return { netAmount: grossAmount, vatAmount: 0 };
  const net = (Math.abs(grossAmount) * 100) / (100 + percent);
  const netAmount = Math.sign(grossAmount) * Math.round(net);
  return { netAmount, vatAmount: grossAmount - netAmount };
}

/** Grosze -> "39.00" (API decimal format). */
export function toDecimal(amount: number): string {
  return (amount / 100).toFixed(2);
}

/** "39.00" / "39,00" / 39 -> 3900 grosze. */
export function fromDecimal(value: string | number): number {
  return Math.round(Number(String(value).replace(",", ".")) * 100);
}
