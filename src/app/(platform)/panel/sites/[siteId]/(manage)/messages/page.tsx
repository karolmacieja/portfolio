import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ContactInbox } from "@/components/contact/inbox";
import { requireUser } from "@/server/auth/session";
import { can, getEntitlements } from "@/server/entitlements";
import { listContactMessages } from "@/server/contact/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("messages");
  return { title: t("title") };
}

/** Contact form messages of one site (owner-scoped through the query). */
export default async function SiteMessagesPage({ params }: PageProps<"/panel/sites/[siteId]/messages">) {
  const { siteId } = await params;
  const user = await requireUser(`/sites/${siteId}/messages`);
  const messages = await listContactMessages(user.id, { siteId });
  return (
    <div className="grid gap-4">
      <ContactInbox
        messages={messages}
        exportHref={
          can(await getEntitlements(user.id), "formsExport") ? `/api/messages/export?site=${siteId}` : null
        }
      />
    </div>
  );
}
