import { getRenderBranding } from "@/server/branding/public";
import { brandNameOf } from "@/server/branding/settings";

/** The platform's logo (or its name when there is none), linking to `href`. Server component. */
export async function BrandMark({ href, className = "" }: { href: string; className?: string }) {
  const branding = await getRenderBranding();
  const name = brandNameOf(branding);
  return (
    <a
      href={href}
      className={`inline-flex items-center text-lg font-semibold ${className}`}
      data-testid="brand-mark"
    >
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- our storage, already optimized
        <img src={branding.logoUrl} alt={name} className="h-8 w-auto max-w-48 object-contain" />
      ) : (
        name
      )}
    </a>
  );
}
