import { z } from "zod";

import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { normalizeHostname } from "@/lib/hosts";
import { getBrandName } from "@/server/branding/settings";
import { getInvoicingSettings } from "@/server/invoicing/settings";

import { DEFAULT_PRIVACY, DEFAULT_TERMS } from "./defaults";

/**
 * Legal documents (Setting "legal"): terms of service and privacy policy, edited by admins. Each save of the
 * terms gets a new version; registration stores the accepted version and signed-in clients are asked to
 * accept a newer one.
 */

export const LEGAL_KINDS = ["terms", "privacy"] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

const documentSchema = z.object({
  content: z.string().max(100_000),
  version: z.string(),
  updatedAt: z.string(),
});
const legalSchema = z.object({ terms: documentSchema.optional(), privacy: documentSchema.optional() });

export type LegalDocument = {
  content: string;
  version: string;
  updatedAt: string | null;
  isDefault: boolean;
};

/** Version of the built-in drafts (until an admin saves the documents). */
export const DEFAULT_LEGAL_VERSION = "2026-10-16";

async function readLegal() {
  const row = await db.setting.findUnique({ where: { key: "legal" } });
  const parsed = legalSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : {};
}

export async function getLegalDocument(kind: LegalKind): Promise<LegalDocument> {
  const stored = (await readLegal())[kind];
  if (stored) return { ...stored, isDefault: false };
  return {
    content: kind === "terms" ? DEFAULT_TERMS : DEFAULT_PRIVACY,
    version: DEFAULT_LEGAL_VERSION,
    updatedAt: null,
    isDefault: true,
  };
}

export async function currentTermsVersion(): Promise<string> {
  return (await getLegalDocument("terms")).version;
}

/** Saves a document; a changed text gets a new version (date and time of the change). */
export async function saveLegalDocument(kind: LegalKind, content: string, now = new Date()): Promise<string> {
  const legal = await readLegal();
  const current = await getLegalDocument(kind);
  if (current.content === content && !current.isDefault) return current.version;
  const version = now.toISOString().slice(0, 16).replace("T", " ");
  const value = { ...legal, [kind]: { content, version, updatedAt: now.toISOString() } };
  await db.setting.upsert({ where: { key: "legal" }, update: { value }, create: { key: "legal", value } });
  return version;
}

/** Fills {company}, {email}, {brand}, {domain} from the seller data and env. */
export async function fillLegalPlaceholders(content: string): Promise<string> {
  const { seller } = await getInvoicingSettings();
  const env = getEnv();
  const host = normalizeHostname(env.ROOT_DOMAIN) ?? env.ROOT_DOMAIN;
  const address = [seller.street, [seller.postalCode, seller.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const company = [seller.name, address, seller.taxId ? `NIP ${seller.taxId}` : ""]
    .filter(Boolean)
    .join(", ");
  const values: Record<string, string> = {
    company,
    email: seller.email || `kontakt@${host}`,
    brand: await getBrandName(),
    domain: host,
  };
  return content.replace(/\{(company|email|brand|domain)\}/g, (_, key: string) => values[key] ?? "");
}
