import type { Env } from "@/lib/env";

import { FakturowniaInvoicingProvider } from "./fakturownia";
import { MockInvoicingProvider } from "./mock";
import type { InvoicingProvider } from "./types";

export * from "./types";

export function createInvoicingProvider(env: Env): InvoicingProvider {
  if (env.INVOICING_PROVIDER === "fakturownia") {
    return new FakturowniaInvoicingProvider({
      domain: env.FAKTUROWNIA_DOMAIN!,
      apiToken: env.FAKTUROWNIA_API_TOKEN!,
      departmentId: env.FAKTUROWNIA_DEPARTMENT_ID,
      sendToKsef: env.FAKTUROWNIA_KSEF,
    });
  }
  return new MockInvoicingProvider();
}
