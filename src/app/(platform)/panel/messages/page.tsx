import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ContactInbox } from "@/components/contact/inbox";
import { requireUser } from "@/server/auth/session";
import { can, getEntitlements } from "@/server/entitlements";
import { listContactMessages } from "@/server/contact/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messages");
  return { title: t("title") };
}

/** Contact form inbox across the client's sites. */
export default async function MessagesPage({ searchParams }: PageProps<"/panel/messages">) {
  const user = await requireUser("/messages");
  const { site } = await searchParams;
  const siteId = typeof site === "string" ? site : undefined;
  const [messages, t] = await Promise.all([
    listContactMessages(user.id, siteId ? { siteId } : {}),
    getTranslations("messages"),
  ]);

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← {t("back")}
      </Link>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ContactInbox
        messages={messages}
        exportHref={
          can(await getEntitlements(user.id), "formsExport")
            ? `/api/messages/export${siteId ? `?site=${siteId}` : ""}`
            : null
        }
      />
    </main>
  );
}
