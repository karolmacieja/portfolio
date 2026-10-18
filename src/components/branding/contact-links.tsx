import { getTranslations } from "next-intl/server";

import { SOCIAL_LABELS } from "@/blocks/render/blocks";
import { getRenderBranding } from "@/server/branding/public";

/** Contact e-mail, phone and social profiles from the branding settings; nothing when none are set. */
export async function ContactLinks({ className = "" }: { className?: string }) {
  const [branding, t] = await Promise.all([getRenderBranding(), getTranslations("marketing")]);
  const { contactEmail, contactPhone, socials } = branding;
  if (!contactEmail && !contactPhone && socials.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`} data-testid="contact-links">
      {contactEmail && (
        <a href={`mailto:${contactEmail}`} className="hover:underline">
          {contactEmail}
        </a>
      )}
      {contactPhone && (
        <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`} className="hover:underline">
          {contactPhone}
        </a>
      )}
      {socials.length > 0 && (
        <nav aria-label={t("footer.socials")} className="flex flex-wrap gap-3">
          {socials.map((social) => (
            <a
              key={`${social.platform}-${social.url}`}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {SOCIAL_LABELS[social.platform]}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
