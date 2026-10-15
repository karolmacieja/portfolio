import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";

/**
 * Shared React Email layout for every transactional mail: brand header, intro, optional quoted user text,
 * call-to-action button with the plain URL below it, and a footer. Texts arrive already translated.
 */

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
};

const colors = { ink: "#18181b", muted: "#52525b", line: "#e4e4e7", page: "#f4f4f5" };

export function LinkMail(parts: LinkMailParts) {
  return (
    <Html lang={parts.locale}>
      <Head />
      <Preview>{parts.intro.slice(0, 140)}</Preview>
      <Body
        style={{ backgroundColor: colors.page, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}
      >
        <Container
          style={{ maxWidth: 560, margin: "24px auto", backgroundColor: "#ffffff", borderRadius: 8 }}
        >
          <Section style={{ padding: "20px 28px", borderBottom: `1px solid ${colors.line}` }}>
            <Text style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.ink }}>{parts.brand}</Text>
          </Section>
          <Section style={{ padding: "8px 28px 24px" }}>
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
            <Button
              href={parts.url}
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: "10px 18px",
                backgroundColor: colors.ink,
                color: "#ffffff",
                borderRadius: 6,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              {parts.cta}
            </Button>
            <Text style={{ fontSize: 12, color: colors.muted, wordBreak: "break-all" }}>{parts.url}</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{parts.ignore}</Text>
          </Section>
          <Hr style={{ borderColor: colors.line, margin: 0 }} />
          <Section style={{ padding: "16px 28px" }}>
            <Text style={{ margin: 0, fontSize: 12, color: colors.muted }}>
              {parts.footer}{" "}
              <Link href={parts.homeUrl} style={{ color: colors.muted }}>
                {parts.homeUrl.replace(/^https?:\/\//, "")}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderLinkMail(parts: LinkMailParts): Promise<{ html: string; text: string }> {
  const element = <LinkMail {...parts} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
