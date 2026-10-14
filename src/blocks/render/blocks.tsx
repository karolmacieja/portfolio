import type { ComponentType } from "react";

import type { BlockProps } from "../schemas";
import { parseVideoUrl } from "../video";
import { EditorPlaceholder, Paragraphs, Section, SectionHeading, SiteImage, SiteLink } from "./primitives";

/**
 * Block renderers. Each receives validated props (see schemas.ts) plus `editMode` when rendered
 * inside the editor, where empty blocks show a placeholder instead of disappearing.
 */

type Ctx = { editMode?: boolean };
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

/** Visual form only; submissions (storage, inbox, email, anti-spam) are wired up in Phase 9. */
export function ContactForm({ heading, description, submitLabel }: Props<"ContactForm">) {
  return (
    <Section>
      <div className="site-container-narrow">
        <SectionHeading>{heading}</SectionHeading>
        {description && <Paragraphs text={description} className="site-muted mb-6" />}
        <form className="grid gap-4">
          <input className="site-input" name="name" placeholder="Imię / Name" disabled />
          <input className="site-input" name="email" type="email" placeholder="E-mail" disabled />
          <textarea className="site-input min-h-32" name="message" placeholder="…" disabled />
          <div>
            <button type="button" className="site-btn" disabled>
              {submitLabel || "→"}
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
      <div className={`site-container grid ${gaps[gap]} ${columnTemplates[layout]} [&_.site-section]:p-0`}>
        <Col1 className="min-h-8" />
        <Col2 className="min-h-8" />
        {layout === "1-1-1" && <Col3 className="min-h-8" />}
      </div>
    </div>
  );
}
