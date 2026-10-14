import { SettingsForm } from "@/components/site-manager/settings-form";
import { getEnv } from "@/lib/env";
import { requireUser } from "@/server/auth/session";
import { getSiteWithPages } from "@/server/sites/service";

export default async function SiteSettingsPage({ params }: PageProps<"/panel/sites/[siteId]/settings">) {
  const { siteId } = await params;
  const user = await requireUser();
  const site = await getSiteWithPages(user.id, siteId);
  return <SettingsForm site={site} rootDomain={getEnv().ROOT_DOMAIN} />;
}
