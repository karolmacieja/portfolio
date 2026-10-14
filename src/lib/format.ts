/** Formats an amount in minor units (grosze) as currency, e.g. 1900 -> "19,00 zł". */
export function formatMoney(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}

/** Human-readable size from megabytes: 500 -> "500 MB", 5120 -> "5 GB". */
export function formatMegabytes(mb: number, locale: string): string {
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return mb >= 1024 ? `${number(mb / 1024)} GB` : `${number(mb)} MB`;
}
