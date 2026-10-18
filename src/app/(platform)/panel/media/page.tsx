import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { MediaLibrary } from "@/components/media/media-library";
import { requireUser } from "@/server/auth/session";
import { DOCUMENT_MAX_MB, getStorageUsage, getUploadLimitBytes, listAssets } from "@/server/media/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("media");
  return { title: t("title") };
}

export default async function MediaPage() {
  const user = await requireUser("/media");
  const [assets, usage] = await Promise.all([listAssets(user.id), getStorageUsage(user.id)]);
  const t = await getTranslations();
  const format = await getFormatter();
  const bytes = (value: number) => format.number(value / 1024 / 1024, { maximumFractionDigits: 1 }) + " MB";
  const percent = Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100));

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← {t("siteNav.back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("media.title")}</h1>
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          {t("media.usage", { used: bytes(usage.usedBytes), quota: bytes(usage.quotaBytes) })}
        </p>
        <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("media.hint", { max: Math.round(getUploadLimitBytes() / 1024 / 1024), pdfMax: DOCUMENT_MAX_MB })}
        </p>
      </div>
      <MediaLibrary assets={assets} />
    </main>
  );
}
