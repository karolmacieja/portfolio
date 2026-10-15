import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";

import type { ResolvedBranding } from "./branding";

/**
 * React Email layouts for every mail: brand header (logo or name), content, accent-coloured button with the
 * plain URL below it, and a footer with the company data. Texts arrive already translated.
 */

const colors = { ink: "#18181b", muted: "#52525b", line: "#e4e4e7", page: "#f4f4f5" };

type Frame = {
  brand: string;
  homeUrl: string;
  locale: string;
  preview: string;
  branding: ResolvedBranding;
  /** Line above the company data (e.g. "A message from Folio."). */
  footer: string;
  /** Extra footer content (unsubscribe link). */
  footerExtra?: React.ReactNode;
  children: React.ReactNode;
};

function MailFrame({ brand, homeUrl, locale, preview, branding, footer, footerExtra, children }: Frame) {
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview.slice(0, 140)}</Preview>
      <Body
        style={{ backgroundColor: colors.page, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}
      >
        <Container
          style={{ maxWidth: 560, margin: "24px auto", backgroundColor: "#ffffff", borderRadius: 8 }}
        >
          <Section style={{ padding: "20px 28px", borderBottom: `3px solid ${branding.accentColor}` }}>
            {branding.logoUrl ? (
              <Img src={branding.logoUrl} alt={brand} height={36} style={{ height: 36, width: "auto" }} />
            ) : (
              <Text style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.ink }}>{brand}</Text>
            )}
          </Section>
          <Section style={{ padding: "8px 28px 24px" }}>{children}</Section>
          <Hr style={{ borderColor: colors.line, margin: 0 }} />
          <Section style={{ padding: "16px 28px" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: colors.muted }}>
              {footer}{" "}
              <Link href={homeUrl} style={{ color: colors.muted }}>
                {homeUrl.replace(/^https?:\/\//, "")}
              </Link>
            </Text>
            {branding.footerLines.length > 0 && (
              <Text style={{ margin: "8px 0 0", fontSize: 12, lineHeight: "18px", color: colors.muted }}>
                {branding.footerLines.map((line, i) => (
                  <span key={i}>
                    {line}
                    <br />
                  </span>
                ))}
              </Text>
            )}
            {footerExtra}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function CtaButton({ url, label, accent }: { url: string; label: string; accent: string }) {
  return (
    <Button
      href={url}
      style={{
        display: "inline-block",
        marginTop: 8,
        padding: "10px 18px",
        backgroundColor: accent,
        color: "#ffffff",
        borderRadius: 6,
        fontSize: 14,
        textDecoration: "none",
      }}
    >
      {label}
    </Button>
  );
}

export type LinkMailParts = {
  brand: string;
  homeUrl: string;
  locale: string;
  intro: string;
  quote?: string;
  cta: string;
  url: string;
  ignore: string;
  footer: string;
  branding: ResolvedBranding;
};

export function LinkMail(parts: LinkMailParts) {
  return (
    <MailFrame {...parts} preview={parts.intro}>
      {parts.intro.split("\n").map((line, index) => (
        <Text key={index} style={{ fontSize: 15, lineHeight: "24px", color: colors.ink }}>
          {line}
        </Text>
      ))}
      {parts.quote && (
        <Text
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 14,
            lineHeight: "22px",
            color: colors.ink,
            borderLeft: `3px solid ${colors.line}`,
            paddingLeft: 12,
          }}
        >
          {parts.quote}
        </Text>
      )}
      <CtaButton url={parts.url} label={parts.cta} accent={parts.branding.accentColor} />
      <Text style={{ fontSize: 12, color: colors.muted, wordBreak: "break-all" }}>{parts.url}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{parts.ignore}</Text>
    </MailFrame>
  );
}

export async function renderLinkMail(parts: LinkMailParts): Promise<{ html: string; text: string }> {
  const element = <LinkMail {...parts} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}

/** Blocks of the campaign mini markup ("## " heading, "- " list items, paragraphs). */
export function parseMarkup(
  body: string,
): ({ kind: "h"; text: string } | { kind: "ul"; items: string[] } | { kind: "p"; text: string })[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.split("\n").filter((line) => line.trim()))
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      if (lines.length === 1 && lines[0]!.startsWith("## "))
        return { kind: "h" as const, text: lines[0]!.slice(3) };
      if (lines.every((line) => line.startsWith("- ")))
        return { kind: "ul" as const, items: lines.map((l) => l.slice(2)) };
      return { kind: "p" as const, text: lines.join("\n") };
    });
}

export type CampaignMailParts = {
  brand: string;
  homeUrl: string;
  locale: string;
  body: string;
  cta: { label: string; url: string } | null;
  footer: string;
  branding: ResolvedBranding;
  /** Marketing mails: the one-click unsubscribe link and its label. */
  unsubscribe: { url: string; label: string; reason: string } | null;
};

export function CampaignMail(parts: CampaignMailParts) {
  const blocks = parseMarkup(parts.body);
  const first = blocks.find((b) => b.kind !== "ul");
  return (
    <MailFrame
      {...parts}
      preview={first && "text" in first ? first.text : ""}
      footerExtra={
        parts.unsubscribe && (
          <Text style={{ margin: "8px 0 0", fontSize: 12, color: colors.muted }}>
            {parts.unsubscribe.reason}{" "}
            <Link href={parts.unsubscribe.url} style={{ color: colors.muted }}>
              {parts.unsubscribe.label}
            </Link>
          </Text>
        )
      }
    >
      {blocks.map((block, index) =>
        block.kind === "h" ? (
          <Heading key={index} as="h2" style={{ fontSize: 20, color: colors.ink, margin: "20px 0 8px" }}>
            {block.text}
          </Heading>
        ) : block.kind === "ul" ? (
          <ul key={index} style={{ paddingLeft: 20, color: colors.ink, fontSize: 15, lineHeight: "24px" }}>
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <Text
            key={index}
            style={{ whiteSpace: "pre-line", fontSize: 15, lineHeight: "24px", color: colors.ink }}
          >
            {block.text}
          </Text>
        ),
      )}
      {parts.cta && (
        <CtaButton url={parts.cta.url} label={parts.cta.label} accent={parts.branding.accentColor} />
      )}
    </MailFrame>
  );
}

export async function renderCampaignMail(parts: CampaignMailParts): Promise<{ html: string; text: string }> {
  const element = <CampaignMail {...parts} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
