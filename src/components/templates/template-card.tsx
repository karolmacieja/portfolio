import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { GalleryTemplate } from "@/server/templates/client";

/** Gallery card: thumbnail, badges, preview link and either a "use" action or a locked CTA. */
export async function TemplateCard({
  template,
  action,
}: {
  template: GalleryTemplate;
  action?: React.ReactNode;
}) {
  const t = await getTranslations("templates");
  const locale = await getLocale();
  return (
    <li className="overflow-hidden rounded-xl border" data-testid={`template-${template.slug}`}>
      <div className="relative aspect-[16/10] bg-muted">
        {template.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnails from our storage
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            className="size-full object-cover object-top"
          />
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {template.isFeatured && <Badge>{t("badges.featured")}</Badge>}
          {template.isNew && <Badge variant="secondary">{t("badges.new")}</Badge>}
          {template.isPremium && template.priceAmount && (
            <Badge variant="secondary">
              {t("badges.premium", { price: formatMoney(template.priceAmount, "PLN", locale) })}
            </Badge>
          )}
        </div>
      </div>
      <div className="grid gap-3 p-4">
        <div>
          <h3 className="font-semibold">
            {!template.canUse && <span aria-label={t("locked")}>🔒 </span>}
            {template.name}
          </h3>
          <p className="text-sm text-muted-foreground">{t(`categories.${template.category as "other"}`)}</p>
          {template.description && <p className="mt-1 text-sm">{template.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/template-preview/${template.slug}`} target="_blank" rel="noreferrer">
              {t("preview")}
            </a>
          </Button>
          {template.canUse ? (
            action
          ) : template.isPremium ? (
            <span className="text-xs text-muted-foreground">{t("premiumLocked")}</span>
          ) : (
            <Button asChild size="sm" variant="secondary">
              <Link href="/plans">{t("upgrade")}</Link>
            </Button>
          )}
        </div>
        {!template.canUse && !template.isPremium && (
          <p className="text-xs text-muted-foreground">{t("locked")}</p>
        )}
      </div>
    </li>
  );
}
