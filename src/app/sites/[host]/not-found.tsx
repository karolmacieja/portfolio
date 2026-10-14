import { getTranslator } from "@/i18n/translator";

export default async function SiteNotFound() {
  const t = await getTranslator("pl");
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold">{t("site.notFoundTitle")}</h1>
      <p className="opacity-70">{t("site.notFoundDescription")}</p>
    </main>
  );
}
