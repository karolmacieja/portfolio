import type { Config } from "@puckeditor/core";
import { z } from "zod";

/**
 * Block library shared by the renderer (Phase 1) and the editor (Phase 2).
 * Render functions must stay pure server-renderable components: no hooks, no browser APIs,
 * no raw HTML from clients (all text is rendered as React text nodes).
 *
 * Phase 1 ships a starter set; the full library (Gallery, Project, Timeline, ...) lands in Phase 2.
 */

/** Prop schemas: the single source of truth for block data, enforced on save and before rendering. */
export const blockPropSchemas = {
  Hero: z.object({
    title: z.string().max(200),
    subtitle: z.string().max(1000),
    align: z.enum(["left", "center"]),
  }),
  Text: z.object({ text: z.string().max(20_000) }),
  Spacer: z.object({ size: z.enum(["sm", "md", "lg"]) }),
};

export type HeroProps = z.infer<typeof blockPropSchemas.Hero>;
export type TextProps = z.infer<typeof blockPropSchemas.Text>;
export type SpacerProps = z.infer<typeof blockPropSchemas.Spacer>;

export type BlockProps = {
  Hero: HeroProps;
  Text: TextProps;
  Spacer: SpacerProps;
};

export type BlockType = keyof BlockProps;

const spacerHeights: Record<SpacerProps["size"], string> = { sm: "h-8", md: "h-16", lg: "h-32" };

export const blocksConfig: Config<BlockProps> = {
  components: {
    Hero: {
      fields: {
        title: { type: "text" },
        subtitle: { type: "textarea" },
        align: {
          type: "radio",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
          ],
        },
      },
      defaultProps: { title: "Heading", subtitle: "", align: "center" },
      render: ({ title, subtitle, align }) => (
        <section
          className={`mx-auto max-w-4xl px-6 py-20 ${align === "center" ? "text-center" : "text-left"}`}
        >
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{title}</h1>
          {subtitle && <p className="mt-6 text-lg whitespace-pre-line opacity-80">{subtitle}</p>}
        </section>
      ),
    },
    Text: {
      fields: { text: { type: "textarea" } },
      defaultProps: { text: "" },
      render: ({ text }) => (
        <section className="mx-auto max-w-3xl px-6 py-6">
          <p className="text-base leading-relaxed whitespace-pre-line">{text}</p>
        </section>
      ),
    },
    Spacer: {
      fields: {
        size: {
          type: "select",
          options: [
            { label: "Small", value: "sm" },
            { label: "Medium", value: "md" },
            { label: "Large", value: "lg" },
          ],
        },
      },
      defaultProps: { size: "md" },
      render: ({ size }) => <div aria-hidden="true" className={spacerHeights[size]} />,
    },
  },
};
