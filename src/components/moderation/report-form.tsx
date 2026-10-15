"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-state";
import { submitReportAction } from "@/server/moderation/actions";

const CATEGORIES = ["ILLEGAL", "COPYRIGHT", "PRIVACY", "FRAUD", "HATE", "OTHER"] as const;

export function ReportForm({ siteId, defaultUrl }: { siteId: string; defaultUrl: string }) {
  const t = useTranslations("report");
  const [state, action, pending] = useActionState<ActionState, FormData>(submitReportAction, {});
  if (state.ok) {
    return (
      <p role="status" data-testid="report-sent">
        {t("sent")}
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-4" data-testid="report-form">
      <input type="hidden" name="siteId" value={siteId} />
      <div className="grid gap-2">
        <Label htmlFor="report-path">{t("url")}</Label>
        <Input
          id="report-path"
          name="path"
          required
          maxLength={500}
          defaultValue={state.values?.path ?? defaultUrl}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="report-category">{t("category")}</Label>
        <select
          id="report-category"
          name="category"
          defaultValue={state.values?.category ?? "ILLEGAL"}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="report-description">{t("description")}</Label>
        <textarea
          id="report-description"
          name="description"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          defaultValue={state.values?.description}
          className="rounded-md border bg-background p-2 text-sm"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="report-email">{t("email")}</Label>
        <Input
          id="report-email"
          name="reporterEmail"
          type="email"
          maxLength={200}
          defaultValue={state.values?.reporterEmail}
        />
      </div>
      <div aria-hidden="true" className="hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{t("privacy")}</p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("submit")}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
