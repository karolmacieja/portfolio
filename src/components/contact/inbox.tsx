import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteMessageAction, setMessageReadAction } from "@/server/contact/actions";
import type { listContactMessages } from "@/server/contact/service";

/** Contact form messages with read/unread and delete actions (owner-scoped list from the caller). */
export async function ContactInbox({
  messages,
  exportHref,
}: {
  messages: Awaited<ReturnType<typeof listContactMessages>>;
  /** CSV export link (plan feature `formsExport`); null shows the upgrade hint. */
  exportHref: string | null;
}) {
  const [t, format] = await Promise.all([getTranslations("messages"), getFormatter()]);
  return (
    <>
      {messages.length > 0 &&
        (exportHref ? (
          <div>
            <Button asChild size="sm" variant="outline">
              <a href={exportHref} download data-testid="messages-export">
                {t("exportCsv")}
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("exportLocked")}{" "}
            <Link href="/plans" className="underline">
              {t("exportUpgrade")}
            </Link>
          </p>
        ))}
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="messages-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-4" data-testid="messages">
          {messages.map((message) => (
            <li key={message.id}>
              <Card className={message.readAt ? "" : "border-primary"}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                  <div className="grid gap-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {message.name}
                      {!message.readAt && <Badge>{t("new")}</Badge>}
                    </CardTitle>
                    <a href={`mailto:${message.email}`} className="text-sm underline">
                      {message.email}
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("meta", {
                      site: message.site.name,
                      path: `/${message.path}`,
                      date: format.dateTime(message.createdAt, { dateStyle: "medium", timeStyle: "short" }),
                    })}
                  </p>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                  <div className="flex flex-wrap gap-2">
                    <ActionForm
                      action={setMessageReadAction}
                      hidden={{ messageId: message.id, read: message.readAt ? "0" : "1" }}
                      label={message.readAt ? t("markUnread") : t("markRead")}
                    />
                    <ActionForm
                      action={deleteMessageAction}
                      hidden={{ messageId: message.id }}
                      label={t("delete")}
                      confirm={t("deleteConfirm")}
                      variant="ghost"
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
