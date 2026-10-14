import { ThemeEditor } from "@/components/site-manager/theme-editor";
import { requireUser } from "@/server/auth/session";
import { saveThemeAction } from "@/server/sites/actions";
import { getSiteWithPages } from "@/server/sites/service";

import "@/themes/fonts.css";
import "@/blocks/blocks.css";

export default async function SiteThemePage({ params }: PageProps<"/panel/sites/[siteId]/theme">) {
  const { siteId } = await params;
  const user = await requireUser();
  const site = await getSiteWithPages(user.id, siteId);
  return <ThemeEditor save={saveThemeAction.bind(null, site.id)} initialTheme={site.theme} />;
}
