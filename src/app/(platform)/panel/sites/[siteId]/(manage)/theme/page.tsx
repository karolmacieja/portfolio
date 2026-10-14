import { ThemeEditor } from "@/components/site-manager/theme-editor";
import { requireUser } from "@/server/auth/session";
import { getSiteWithPages } from "@/server/sites/service";

import "@/themes/fonts.css";
import "@/blocks/blocks.css";

export default async function SiteThemePage({ params }: PageProps<"/panel/sites/[siteId]/theme">) {
  const { siteId } = await params;
  const user = await requireUser();
  const site = await getSiteWithPages(user.id, siteId);
  return <ThemeEditor siteId={site.id} initialTheme={site.theme} />;
}
