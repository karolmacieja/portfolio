import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/auth/actions";

export async function SignOutButton() {
  const t = await getTranslations("common");
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" size="sm">
        {t("signOut")}
      </Button>
    </form>
  );
}
