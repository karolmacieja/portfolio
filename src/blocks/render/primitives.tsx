import type { ReactNode } from "react";

import type { ImageValue } from "../schemas";

/**
 * Shared building blocks for block renderers. Server-safe: no hooks, no browser APIs.
 * Images are pre-optimized on upload (WebP, bounded size), so a plain lazy <img> is used.
 */

export function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`site-section ${className}`}>{children}</section>;
}

export function SectionHeading({
  children,
  align = "left",
}: {
  children: string;
  align?: "left" | "center";
}) {
  if (!children) return null;
  return (
    <h2 className={`site-heading mb-8 text-3xl sm:text-4xl ${align === "center" ? "text-center" : ""}`}>
      {children}
    </h2>
  );
}

export function SiteImage({
  image,
  className = "",
  sizes,
}: {
  image: ImageValue;
  className?: string;
  sizes?: string;
}) {
  if (!image.url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- images are optimized at upload time
    <img
      src={image.url}
      alt={image.alt}
      width={image.width}
      height={image.height}
      sizes={sizes}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}

/** Shown in the editor when a block has nothing to display yet; renders nothing on live sites. */
export function EditorPlaceholder({ show, children }: { show: boolean; children: string }) {
  if (!show) return null;
  return <div className="site-placeholder">{children}</div>;
}

export function Paragraphs({ text, className = "" }: { text: string; className?: string }) {
  if (!text) return null;
  return <div className={`whitespace-pre-line ${className}`}>{text}</div>;
}

export function isExternal(href: string) {
  return /^https?:\/\//i.test(href);
}

export function SiteLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const external = isExternal(href);
  return (
    <a
      href={href}
      className={className}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
