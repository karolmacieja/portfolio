import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { splitGross, toDecimal } from "./amounts";
import type { InvoiceLine, InvoiceParty, VatRate } from "./types";

/**
 * Minimal invoice PDF for the mock provider (development and tests). Production PDFs come from
 * Fakturownia. Uses a DejaVu subset (assets/fonts) because the standard PDF fonts lack Polish letters.
 */

export type InvoicePdfData = {
  title: string;
  number: string;
  issueDate: Date;
  sellDate: Date;
  placeOfIssue: string | null;
  seller: InvoiceParty & { bankAccount?: string | null };
  buyer: InvoiceParty;
  /** `informational` lines (state before/after a correction) are listed but not summed. */
  lines: (InvoiceLine & { label?: string; informational?: boolean })[];
  currency: string;
  reverseCharge: boolean;
  exemptionBasis: string | null;
  notes: string[];
};

let fonts: Promise<[Buffer, Buffer]> | undefined;
function loadFonts() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  fonts ??= Promise.all([
    readFile(path.join(dir, "DejaVuSans.ttf")),
    readFile(path.join(dir, "DejaVuSans-Bold.ttf")),
  ]);
  return fonts;
}

const RATE_LABEL: Record<VatRate, string> = {
  "23": "23%",
  "8": "8%",
  "5": "5%",
  "0": "0%",
  zw: "zw",
  np: "np",
};
const date = (value: Date) => value.toISOString().slice(0, 10);
const money = (amount: number, currency: string) => `${toDecimal(amount).replace(".", ",")} ${currency}`;

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await loadFonts();
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  doc.setTitle(`${data.title} ${data.number}`);

  const page = doc.addPage([595.28, 841.89]);
  const margin = 50;
  let y = 790;
  const text = (value: string, x: number, size = 10, font: PDFFont = regular, target: PDFPage = page) =>
    target.drawText(value, { x, y, size, font, color: rgb(0.1, 0.1, 0.1) });

  text(`${data.title} ${data.number}`, margin, 18, bold);
  y -= 22;
  text(`Data wystawienia: ${date(data.issueDate)}   Data sprzedaży: ${date(data.sellDate)}`, margin, 9);
  if (data.placeOfIssue) {
    y -= 13;
    text(`Miejsce wystawienia: ${data.placeOfIssue}`, margin, 9);
  }

  y -= 34;
  const top = y;
  const party = (label: string, p: InvoiceParty & { bankAccount?: string | null }, x: number) => {
    y = top;
    text(label, x, 9, bold);
    const rows = [
      p.name,
      p.street,
      `${p.postalCode} ${p.city}`.trim(),
      p.country,
      p.taxId ? `${p.taxIdKind === "eu" ? "VAT UE" : "NIP"}: ${p.taxId}` : "",
      p.bankAccount ? `Konto: ${p.bankAccount}` : "",
    ].filter(Boolean);
    for (const row of rows) {
      y -= 13;
      text(row, x, 10);
    }
    return y;
  };
  const bottom = Math.min(party("Sprzedawca", data.seller, margin), party("Nabywca", data.buyer, 310));

  y = bottom - 36;
  const columns = [margin, 290, 360, 420, 490];
  ["Nazwa", "Netto", "VAT", "Kwota VAT", "Brutto"].forEach((h, i) => text(h, columns[i]!, 9, bold));
  page.drawLine({ start: { x: margin, y: y - 4 }, end: { x: 545, y: y - 4 }, thickness: 0.5 });
  let totalNet = 0;
  let totalVat = 0;
  let totalGross = 0;
  for (const line of data.lines) {
    const { netAmount, vatAmount } = splitGross(line.grossAmount, line.vatRate);
    if (!line.informational) {
      totalNet += netAmount;
      totalVat += vatAmount;
      totalGross += line.grossAmount;
    }
    y -= 18;
    text(`${line.label ? `${line.label}: ` : ""}${line.name}`.slice(0, 48), columns[0]!, 9);
    text(toDecimal(netAmount), columns[1]!, 9);
    text(RATE_LABEL[line.vatRate], columns[2]!, 9);
    text(toDecimal(vatAmount), columns[3]!, 9);
    text(toDecimal(line.grossAmount), columns[4]!, 9);
  }
  y -= 28;
  text(`Razem netto: ${money(totalNet, data.currency)}`, 330, 10);
  y -= 14;
  text(`VAT: ${money(totalVat, data.currency)}`, 330, 10);
  y -= 16;
  text(
    totalGross < 0
      ? `Do zwrotu: ${money(-totalGross, data.currency)}`
      : `Razem brutto: ${money(totalGross, data.currency)}`,
    330,
    12,
    bold,
  );
  y -= 14;
  text(totalGross < 0 ? "Zwrot na kartę / rachunek płatnika." : "Zapłacono kartą / online.", 330, 9);

  y -= 34;
  const notes = [
    ...(data.reverseCharge
      ? ["Odwrotne obciążenie (art. 28b ustawy o VAT; art. 196 Dyrektywy 2006/112/WE)."]
      : []),
    ...(data.exemptionBasis ? [`Podstawa zwolnienia z VAT: ${data.exemptionBasis}`] : []),
    ...data.notes,
  ];
  for (const note of notes) {
    text(note.slice(0, 110), margin, 9);
    y -= 13;
  }
  text("Dokument testowy (INVOICING_PROVIDER=mock) — nie jest fakturą w rozumieniu przepisów.", margin, 8);

  return Buffer.from(await doc.save());
}
