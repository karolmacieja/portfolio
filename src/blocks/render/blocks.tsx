import { Check, FileText } from "lucide-react";
import type { ComponentType } from "react";

import { colorCss } from "../appearance";
import type { BlockProps } from "../schemas";
import { parseVideoUrl } from "../video";
import { BLOCK_ICONS } from "./icons";
import { EditorPlaceholder, Paragraphs, Section, SectionHeading, SiteImage, SiteLink } from "./primitives";

/**
 * Block renderers. Each receives validated props (see schemas.ts) plus `editMode` when rendered
 * inside the editor, where empty blocks show a placeholder instead of disappearing.
 */

/** Translated system texts of the published site (passed as Puck `metadata`, see `siteRenderMetadata`). */
export type SiteRenderMetadata = {
  contact?: Record<"name" | "email" | "message" | "submit" | "sent" | "error" | "honeypot", string>;
  download?: string;
};

type Ctx = { editMode?: boolean; site?: SiteRenderMetadata };
type Props<K extends keyof BlockProps> = BlockProps[K] & Ctx;

const gridCols = {
  "2": "sm:grid-cols-2",
  "3": "sm:grid-cols-2 lg:grid-cols-3",
  "4": "sm:grid-cols-2 lg:grid-cols-4",
};
const masonryCols = {
  "2": "sm:columns-2",
  "3": "sm:columns-2 lg:columns-3",
  "4": "sm:columns-2 lg:columns-4",
};

export function Hero({ title, subtitle, align, image, buttonLabel, buttonHref, editMode }: Props<"Hero">) {
  const centered = align === "center";
  return (
    <Section>
      <div className={`site-container grid items-center gap-10 ${image.url ? "md:grid-cols-2" : ""}`}>
        <div className={centered && !image.url ? "site-container-narrow text-center" : ""}>
          {title ? (
            <h1 className="site-heading text-4xl sm:text-6xl">{title}</h1>
          ) : (
            <EditorPlaceholder show={Boolean(editMode)}>Hero</EditorPlaceholder>
          )}
          {subtitle && <Paragraphs text={subtitle} className="site-muted mt-6 text-lg" />}
          {buttonLabel && buttonHref && (
            <div className="mt-8">
              <SiteLink href={buttonHref} className="site-btn">
                {buttonLabel}
              </SiteLink>
            </div>
          )}
        </div>
        {image.url && <SiteImage image={image} className="site-rounded h-auto w-full object-cover" />}
      </div>
    </Section>
  );
}

export function Text({ heading, text, align, editMode }: Props<"Text">) {
  if (!heading && !text) return <EditorPlaceholder show={Boolean(editMode)}>Text</EditorPlaceholder>;
  return (
    <Section>
      <div className={`site-container-narrow ${align === "center" ? "text-center" : ""}`}>
        <SectionHeading align={align}>{heading}</SectionHeading>
        <Paragraphs text={text} className="text-lg" />
      </div>
    </Section>
  );
}

export function Image({ image, caption, width, editMode }: Props<"Image">) {
  if (!image.url) return <EditorPlaceholder show={Boolean(editMode)}>Image</EditorPlaceholder>;
  const container = width === "full" ? "" : width === "wide" ? "site-container" : "site-container-narrow";
  return (
    <Section className={width === "full" ? "!px-0" : ""}>
      <figure className={container}>
        <SiteImage image={image} className={`h-auto w-full ${width === "full" ? "" : "site-rounded"}`} />
        {caption && <figcaption className="site-muted mt-3 text-center text-sm">{caption}</figcaption>}
      </figure>
    </Section>
  );
}

export function Gallery({ heading, layout, columns, images, editMode }: Props<"Gallery">) {
  const items = images.filter((item) => item.image.url);
  if (items.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Gallery</EditorPlaceholder>;

  const figures = items.map((item, index) => (
    <figure key={index} className={layout === "masonry" ? "mb-4 break-inside-avoid" : ""}>
      <SiteImage
        image={item.image}
        className={`site-rounded w-full ${layout === "grid" ? "aspect-[4/3] object-cover" : "h-auto"}`}
      />
      {item.caption && <figcaption className="site-muted mt-2 text-sm">{item.caption}</figcaption>}
    </figure>
  ));

  return (
    <Section>
      <div className="site-container">
        <SectionHeading>{heading}</SectionHeading>
        {layout === "carousel" ? (
          <div className="site-carousel pb-4">{figures}</div>
        ) : layout === "masonry" ? (
          <div className={`gap-4 ${masonryCols[columns]}`}>{figures}</div>
        ) : (
          <div className={`grid gap-4 ${gridCols[columns]}`}>{figures}</div>
        )}
      </div>
    </Section>
  );
}

export function Project({
  title,
  subtitle,
  description,
  images,
  linkLabel,
  linkHref,
  editMode,
}: Props<"Project">) {
  if (!title && !description && images.length === 0) {
    return <EditorPlaceholder show={Boolean(editMode)}>Project</EditorPlaceholder>;
  }
  return (
    <Section>
      <article className="site-container grid gap-8">
        <header className="site-container-narrow !mx-0 w-full">
          {title && <h2 className="site-heading text-3xl sm:text-4xl">{title}</h2>}
          {subtitle && <p className="site-muted mt-2">{subtitle}</p>}
        </header>
        {description && <Paragraphs text={description} className="max-w-3xl text-lg" />}
        <div className="grid gap-4 sm:grid-cols-2">
          {images.map((item, index) => (
            <SiteImage
              key={index}
              image={item.image}
              className={`site-rounded h-auto w-full ${index === 0 && images.length % 2 === 1 ? "sm:col-span-2" : ""}`}
            />
          ))}
        </div>
        {linkLabel && linkHref && (
          <div>
            <SiteLink href={linkHref} className="site-btn">
              {linkLabel}
            </SiteLink>
          </div>
        )}
      </article>
    </Section>
  );
}

export function ProjectList({ heading, columns, items, editMode }: Props<"ProjectList">) {
  if (items.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Project list</EditorPlaceholder>;
  return (
    <Section>
      <div className="site-container">
        <SectionHeading>{heading}</SectionHeading>
        <ul className={`grid gap-8 ${gridCols[columns]}`}>
          {items.map((item, index) => {
            const card = (
              <>
                {item.image.url && (
                  <SiteImage image={item.image} className="site-rounded aspect-[4/3] w-full object-cover" />
                )}
                <h3 className="site-heading mt-4 text-xl">{item.title}</h3>
                {item.description && <p className="site-muted mt-1">{item.description}</p>}
              </>
            );
            return (
              <li key={index}>
                {item.href ? (
                  <SiteLink href={item.href} className="block transition-opacity hover:opacity-80">
                    {card}
                  </SiteLink>
                ) : (
                  card
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

export function About({ heading, text, image, imagePosition, editMode }: Props<"About">) {
  if (!heading && !text && !image.url)
    return <EditorPlaceholder show={Boolean(editMode)}>About</EditorPlaceholder>;
  return (
    <Section>
      <div className={`site-container grid items-center gap-10 ${image.url ? "md:grid-cols-2" : ""}`}>
        {image.url && (
          <SiteImage
            image={image}
            className={`site-rounded h-auto w-full object-cover ${imagePosition === "right" ? "md:order-2" : ""}`}
          />
        )}
        <div>
          <SectionHeading>{heading}</SectionHeading>
          <Paragraphs text={text} className="text-lg" />
        </div>
      </div>
    </Section>
  );
}

export function Timeline({ heading, items, editMode }: Props<"Timeline">) {
  if (items.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Timeline</EditorPlaceholder>;
  return (
    <Section>
      <div className="site-container-narrow">
        <SectionHeading>{heading}</SectionHeading>
        <ol className="grid gap-8 border-l-2 border-[color:var(--site-surface,#e4e4e7)] pl-6">
          {items.map((item, index) => (
            <li key={index} className="relative">
              <span className="absolute top-2 -left-[1.95rem] size-3 rounded-full bg-[color:var(--site-primary,#111)]" />
              {item.period && <p className="site-muted text-sm">{item.period}</p>}
              <h3 className="site-heading text-xl">{item.title}</h3>
              {item.organization && <p className="font-medium">{item.organization}</p>}
              {item.description && <Paragraphs text={item.description} className="site-muted mt-2" />}
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

export function Skills({ heading, style, items, editMode }: Props<"Skills">) {
  if (items.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Skills</EditorPlaceholder>;
  return (
    <Section>
      <div className="site-container-narrow">
        <SectionHeading>{heading}</SectionHeading>
        {style === "tags" ? (
          <ul className="flex flex-wrap gap-2">
            {items.map((item, index) => (
              <li key={index} className="site-surface px-4 py-2 text-sm font-medium">
                {item.name}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-4">
            {items.map((item, index) => (
              <li key={index}>
                <div className="mb-1 flex justify-between text-sm font-medium">
                  <span>{item.name}</span>
                  <span className="site-muted">{item.level}%</span>
                </div>
                <div className="site-surface h-2 overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--site-primary,#111)]"
                    style={{ width: `${item.level}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

export function Testimonials({ heading, items, editMode }: Props<"Testimonials">) {
  if (items.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Testimonials</EditorPlaceholder>;
  return (
    <Section>
      <div className="site-container">
        <SectionHeading>{heading}</SectionHeading>
        <div className="grid gap-6 md:grid-cols-2">
          {items.map((item, index) => (
            <figure key={index} className="site-surface p-6">
              <blockquote className="text-lg whitespace-pre-line">“{item.quote}”</blockquote>
              <figcaption className="mt-4">
                <span className="font-semibold">{item.author}</span>
                {item.role && <span className="site-muted"> · {item.role}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Section>
  );
}

/**
 * Plain HTML form posting to /_p/contact on the site's own host (no JavaScript, the page stays static).
 * The handler redirects back with #contact-sent / #contact-error, shown via CSS :target.
 */
export function ContactForm({ heading, description, submitLabel, editMode, site }: Props<"ContactForm">) {
  const labels = site?.contact;
  return (
    <Section>
      <div className="site-container-narrow">
        <SectionHeading>{heading}</SectionHeading>
        {description && <Paragraphs text={description} className="site-muted mb-6" />}
        <form className="grid gap-4" method="post" action="/_p/contact" data-testid="contact-form">
          <p id="contact-sent" className="site-form-notice" role="status">
            {labels?.sent}
          </p>
          <p id="contact-error" className="site-form-notice site-form-notice-error" role="alert">
            {labels?.error}
          </p>
          <label className="grid gap-1">
            <span className="site-muted text-sm">{labels?.name ?? "Imię / Name"}</span>
            <input
              className="site-input"
              name="name"
              required
              maxLength={200}
              autoComplete="name"
              disabled={editMode}
            />
          </label>
          <label className="grid gap-1">
            <span className="site-muted text-sm">{labels?.email ?? "E-mail"}</span>
            <input
              className="site-input"
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="email"
              disabled={editMode}
            />
          </label>
          <label className="grid gap-1">
            <span className="site-muted text-sm">{labels?.message ?? "…"}</span>
            <textarea
              className="site-input min-h-32"
              name="message"
              required
              minLength={2}
              maxLength={5000}
              disabled={editMode}
            />
          </label>
          {/* Honeypot: hidden from people, filled in by bots. */}
          <label className="site-hp" aria-hidden="true">
            {labels?.honeypot}
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <div>
            <button type={editMode ? "button" : "submit"} className="site-btn" disabled={editMode}>
              {submitLabel || labels?.submit || "→"}
            </button>
          </div>
        </form>
      </div>
    </Section>
  );
}

const SOCIAL_LABELS: Record<BlockProps["SocialLinks"]["items"][number]["platform"], string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  behance: "Behance",
  dribbble: "Dribbble",
  github: "GitHub",
  x: "X",
  facebook: "Facebook",
  youtube: "YouTube",
  vimeo: "Vimeo",
  tiktok: "TikTok",
  email: "E-mail",
  website: "WWW",
};

export function SocialLinks({ heading, align, items, editMode }: Props<"SocialLinks">) {
  const links = items.filter((item) => item.url);
  if (links.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Social links</EditorPlaceholder>;
  return (
    <Section>
      <div className={`site-container ${align === "center" ? "text-center" : ""}`}>
        <SectionHeading align={align}>{heading}</SectionHeading>
        <ul className={`flex flex-wrap gap-3 ${align === "center" ? "justify-center" : ""}`}>
          {links.map((item, index) => (
            <li key={index}>
              <SiteLink
                href={item.url}
                className="site-surface inline-block px-4 py-2 font-medium hover:opacity-80"
              >
                {SOCIAL_LABELS[item.platform]}
              </SiteLink>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

export function Video({ url, caption, editMode }: Props<"Video">) {
  const embed = parseVideoUrl(url);
  if (!embed) return <EditorPlaceholder show={Boolean(editMode)}>YouTube / Vimeo</EditorPlaceholder>;
  return (
    <Section>
      <figure className="site-container">
        <div className="site-rounded aspect-video overflow-hidden">
          <iframe
            src={embed.embedUrl}
            title={caption || embed.provider}
            className="size-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        {caption && <figcaption className="site-muted mt-3 text-center text-sm">{caption}</figcaption>}
      </figure>
    </Section>
  );
}

const spacerHeights = { sm: "h-8", md: "h-16", lg: "h-32" } as const;

export function Spacer({ size }: Props<"Spacer">) {
  return <div aria-hidden="true" className={spacerHeights[size]} />;
}

type SlotComponent = ComponentType<{ className?: string }>;
type ColumnsRenderProps = Omit<Props<"Columns">, "col1" | "col2" | "col3"> & {
  col1: SlotComponent;
  col2: SlotComponent;
  col3: SlotComponent;
};

const columnTemplates = {
  "1-1": "md:grid-cols-2",
  "1-2": "md:grid-cols-[1fr_2fr]",
  "2-1": "md:grid-cols-[2fr_1fr]",
  "1-1-1": "md:grid-cols-3",
} as const;
const gaps = { sm: "gap-4", md: "gap-8", lg: "gap-16" } as const;

/** Nested blocks render without their own section padding to avoid doubled spacing. */
export function Columns({ layout, gap, col1: Col1, col2: Col2, col3: Col3 }: ColumnsRenderProps) {
  return (
    <div className="site-section">
      <div className={`site-columns site-container grid ${gaps[gap]} ${columnTemplates[layout]}`}>
        <Col1 className="min-h-8" />
        <Col2 className="min-h-8" />
        {layout === "1-1-1" && <Col3 className="min-h-8" />}
      </div>
    </div>
  );
}

const alignText = { left: "", center: "text-center", right: "text-right" } as const;
const alignFlex = { left: "", center: "justify-center", right: "justify-end" } as const;
const alignBlock = { left: "", center: "mx-auto", right: "ml-auto" } as const;
const headingSizes = {
  sm: "text-2xl sm:text-3xl",
  md: "text-3xl sm:text-4xl",
  lg: "text-4xl sm:text-5xl",
  xl: "text-5xl sm:text-6xl",
} as const;

export function Heading({ text, subtitle, level, size, align, editMode }: Props<"Heading">) {
  if (!text && !subtitle) return <EditorPlaceholder show={Boolean(editMode)}>Heading</EditorPlaceholder>;
  const Tag = level;
  return (
    <Section>
      <div className={`site-container ${alignText[align]}`}>
        {text && <Tag className={`site-heading ${headingSizes[size]}`}>{text}</Tag>}
        {subtitle && (
          <Paragraphs text={subtitle} className={`site-muted mt-4 max-w-3xl text-lg ${alignBlock[align]}`} />
        )}
      </div>
    </Section>
  );
}

export function Buttons({ align, items, editMode }: Props<"Buttons">) {
  const buttons = items.filter((item) => item.label && item.href);
  if (buttons.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Buttons</EditorPlaceholder>;
  return (
    <Section>
      <div className={`site-container flex flex-wrap gap-3 ${alignFlex[align]}`}>
        {buttons.map((item, index) => (
          <SiteLink
            key={index}
            href={item.href}
            className={item.variant === "secondary" ? "site-btn site-btn-secondary" : "site-btn"}
          >
            {item.label}
          </SiteLink>
        ))}
      </div>
    </Section>
  );
}

export function Quote({ quote, author, role, align, image, editMode }: Props<"Quote">) {
  if (!quote) return <EditorPlaceholder show={Boolean(editMode)}>Quote</EditorPlaceholder>;
  const centered = align === "center";
  return (
    <Section>
      <figure className={`site-container-narrow ${centered ? "text-center" : ""}`}>
        <span
          aria-hidden="true"
          className="site-heading block text-6xl leading-none text-[color:var(--site-accent)]"
        >
          “
        </span>
        <blockquote className="site-heading text-2xl leading-snug font-medium whitespace-pre-line sm:text-3xl">
          {quote}
        </blockquote>
        {(author || image.url) && (
          <figcaption className={`mt-6 flex items-center gap-3 ${centered ? "justify-center" : ""}`}>
            {image.url && <SiteImage image={image} className="size-12 rounded-full object-cover" />}
            <span className="text-left">
              {author && <span className="block font-semibold">{author}</span>}
              {role && <span className="site-muted text-sm">{role}</span>}
            </span>
          </figcaption>
        )}
      </figure>
    </Section>
  );
}

export function Divider({ variant, width }: Props<"Divider">) {
  const size = width === "short" ? "mx-auto max-w-32" : "";
  return (
    <div className="site-section" role="separator">
      <div className={`site-container ${size}`}>
        {variant === "dots" ? (
          <div aria-hidden="true" className="site-divider-dots">
            <span />
            <span />
            <span />
          </div>
        ) : variant === "wave" ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 240 12"
            preserveAspectRatio="none"
            className="site-divider-wave h-3 w-full"
          >
            <path
              d="M0 6 Q 15 0 30 6 T 60 6 T 90 6 T 120 6 T 150 6 T 180 6 T 210 6 T 240 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <hr className="site-divider" />
        )}
      </div>
    </div>
  );
}

const iconColumns = { "1": "", "2": "sm:grid-cols-2", "3": "sm:grid-cols-2 lg:grid-cols-3" } as const;

export function IconList({ heading, columns, items, editMode }: Props<"IconList">) {
  if (items.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Icon list</EditorPlaceholder>;
  return (
    <Section>
      <div className={columns === "1" ? "site-container-narrow" : "site-container"}>
        <SectionHeading>{heading}</SectionHeading>
        <ul className={`grid gap-8 ${iconColumns[columns]}`}>
          {items.map((item, index) => {
            const Icon = BLOCK_ICONS[item.icon];
            return (
              <li key={index} className="flex gap-4">
                <span className="site-icon">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  {item.title && <h3 className="site-heading text-lg">{item.title}</h3>}
                  {item.text && <Paragraphs text={item.text} className="site-muted mt-1" />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

type SectionRenderProps = Omit<Props<"Section">, "content"> & { content: SlotComponent };

const bandHeights = { auto: "", half: "min-h-[50vh]", screen: "min-h-[100svh]" } as const;
const bandAlign = { top: "justify-start", center: "justify-center", bottom: "justify-end" } as const;
const gradientDirections = { vertical: "to bottom", horizontal: "to right", diagonal: "135deg" } as const;

/**
 * Container with its own background (colour via appearance, gradient, or an image with an overlay)
 * holding other blocks. The image is an <img>, never a CSS url(), so URLs can't inject styles.
 */
export function SectionBlock({
  image,
  overlay,
  gradient,
  gradientFrom,
  gradientTo,
  minHeight,
  verticalAlign,
  content: Content,
}: SectionRenderProps) {
  const backgroundImage =
    gradient === "none"
      ? undefined
      : `linear-gradient(${gradientDirections[gradient]}, ${colorCss(gradientFrom) ?? "transparent"}, ${
          colorCss(gradientTo) ?? "transparent"
        })`;
  const dark = Boolean(image.url) && overlay === "dark";
  return (
    <section
      className={`site-section site-band relative isolate flex flex-col ${bandHeights[minHeight]} ${
        bandAlign[verticalAlign]
      } ${dark ? "site-band-dark" : ""}`}
      style={backgroundImage ? { backgroundImage } : undefined}
    >
      {image.url && <SiteImage image={image} className="absolute inset-0 -z-10 size-full object-cover" />}
      {image.url && overlay !== "none" && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 -z-10 ${dark ? "bg-black/55" : "bg-white/65"}`}
        />
      )}
      <Content className="min-h-16 w-full" />
    </section>
  );
}

const featureLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const pricingColumns = (count: number) =>
  count <= 1
    ? "mx-auto max-w-md"
    : count === 2
      ? "mx-auto max-w-4xl md:grid-cols-2"
      : count === 4
        ? "md:grid-cols-2 xl:grid-cols-4"
        : "md:grid-cols-2 lg:grid-cols-3";

export function Pricing({ heading, description, items, editMode }: Props<"Pricing">) {
  if (items.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Pricing</EditorPlaceholder>;
  return (
    <Section>
      <div className="site-container">
        <SectionHeading align="center">{heading}</SectionHeading>
        {description && (
          <Paragraphs
            text={description}
            className="site-muted mx-auto -mt-4 mb-10 max-w-2xl text-center text-lg"
          />
        )}
        <ul className={`grid gap-6 ${pricingColumns(items.length)}`}>
          {items.map((item, index) => (
            <li
              key={index}
              className={`site-card flex flex-col p-6 ${item.featured ? "site-card-featured" : ""}`}
            >
              <h3 className="site-heading text-xl">{item.name}</h3>
              {item.price && (
                <p className="mt-4">
                  <span className="site-heading text-4xl">{item.price}</span>
                  {item.period && <span className="site-muted"> {item.period}</span>}
                </p>
              )}
              {item.description && <Paragraphs text={item.description} className="site-muted mt-2" />}
              {item.features && (
                <ul className="mt-6 grid gap-2 text-sm">
                  {featureLines(item.features).map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-[color:var(--site-accent)]"
                        aria-hidden="true"
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              )}
              {item.buttonLabel && item.buttonHref && (
                <div className="mt-auto pt-8">
                  <SiteLink
                    href={item.buttonHref}
                    className={`site-btn w-full ${item.featured ? "" : "site-btn-secondary"}`}
                  >
                    {item.buttonLabel}
                  </SiteLink>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/** Questions use native <details>, so they open without JavaScript. */
export function Faq({ heading, items, editMode }: Props<"Faq">) {
  const questions = items.filter((item) => item.question);
  if (questions.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>FAQ</EditorPlaceholder>;
  return (
    <Section>
      <div className="site-container-narrow">
        <SectionHeading>{heading}</SectionHeading>
        <div>
          {questions.map((item, index) => (
            <details key={index} className="site-faq">
              <summary>
                <span>{item.question}</span>
                <span aria-hidden="true" className="site-faq-icon">
                  +
                </span>
              </summary>
              <Paragraphs text={item.answer} className="site-muted pb-5" />
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

const statsColumns = (count: number) =>
  count <= 2 ? "sm:grid-cols-2" : count === 3 ? "sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4";

export function Stats({ heading, items, editMode }: Props<"Stats">) {
  const stats = items.filter((item) => item.value || item.label);
  if (stats.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Stats</EditorPlaceholder>;
  return (
    <Section>
      <div className="site-container">
        <SectionHeading align="center">{heading}</SectionHeading>
        <ul className={`grid gap-8 text-center ${statsColumns(stats.length)}`}>
          {stats.map((item, index) => (
            <li key={index}>
              <p className="site-heading text-4xl sm:text-5xl">{item.value}</p>
              {item.label && <p className="site-muted mt-2">{item.label}</p>}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

export function Logos({ heading, grayscale, items, editMode }: Props<"Logos">) {
  const logos = items.filter((item) => item.image.url);
  if (logos.length === 0) return <EditorPlaceholder show={Boolean(editMode)}>Logos</EditorPlaceholder>;
  return (
    <Section>
      <div className="site-container">
        <SectionHeading align="center">{heading}</SectionHeading>
        <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
          {logos.map((item, index) => {
            const logo = (
              <SiteImage
                image={item.image}
                className={`h-10 w-auto max-w-40 object-contain sm:h-12 ${grayscale ? "site-logo-gray" : ""}`}
              />
            );
            return (
              <li key={index}>
                {item.href ? (
                  <SiteLink href={item.href} className="block">
                    {logo}
                  </SiteLink>
                ) : (
                  logo
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileDownload({
  heading,
  description,
  file,
  buttonLabel,
  editMode,
  site,
}: Props<"FileDownload">) {
  if (!file.url) return <EditorPlaceholder show={Boolean(editMode)}>PDF</EditorPlaceholder>;
  const size = formatFileSize(file.sizeBytes);
  return (
    <Section>
      <div className="site-container-narrow">
        <div className="site-surface flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
          <div className="flex gap-4">
            <span className="site-icon">
              <FileText className="size-5" aria-hidden="true" />
            </span>
            <div>
              {heading && <h3 className="site-heading text-xl">{heading}</h3>}
              {description && <Paragraphs text={description} className="site-muted mt-1" />}
              <p className="site-muted mt-1 text-sm">
                {file.name}
                {size && ` · PDF, ${size}`}
              </p>
            </div>
          </div>
          <a href={file.url} download={file.name} className="site-btn shrink-0" data-testid="file-download">
            {buttonLabel || site?.download || "↓"}
          </a>
        </div>
      </div>
    </Section>
  );
}

/** Renderer per block type (the Section block's renderer can't share the `Section` primitive's name). */
export const BLOCK_RENDERERS = {
  Hero,
  Text,
  Image,
  Gallery,
  Project,
  ProjectList,
  About,
  Timeline,
  Skills,
  Testimonials,
  ContactForm,
  SocialLinks,
  Video,
  Spacer,
  Columns,
  Heading,
  Buttons,
  Quote,
  Divider,
  IconList,
  Section: SectionBlock,
  Pricing,
  Faq,
  Stats,
  Logos,
  FileDownload,
} satisfies Record<keyof BlockProps, unknown>;
