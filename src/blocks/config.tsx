import type { Config } from "@puckeditor/core";

import { appearanceFrame, type BlockAppearance } from "./appearance";
import { blockDefaults } from "./defaults";
import { BLOCK_RENDERERS } from "./render/blocks";
import { SLOT_PROPS, type BlockType } from "./schemas";

/**
 * Render-only Puck config shared by published sites and the editor (which adds fields and
 * labels on top, see src/components/editor/editor-config.tsx).
 */

type AnyRender = (props: Record<string, unknown>) => React.ReactElement | null;

export const BLOCK_CATEGORIES: Record<string, BlockType[]> = {
  layout: ["Hero", "Section", "Columns", "Spacer", "Divider"],
  content: ["Heading", "Text", "Quote", "Buttons", "IconList", "About", "Image", "Video"],
  portfolio: ["Gallery", "Project", "ProjectList", "Logos"],
  profile: ["Timeline", "Skills", "Testimonials", "Stats"],
  business: ["Pricing", "Faq", "FileDownload"],
  contact: ["ContactForm", "SocialLinks"],
};

const components = Object.fromEntries(
  (Object.keys(blockDefaults) as BlockType[]).map((type) => [
    type,
    {
      defaultProps: blockDefaults[type],
      // Puck only turns slot props into components when the config declares them (also when rendering).
      ...(SLOT_PROPS[type]
        ? { fields: Object.fromEntries(SLOT_PROPS[type].map((prop) => [prop, { type: "slot" }])) }
        : {}),
      render: (({
        puck,
        appearance,
        ...props
      }: {
        puck?: { isEditing?: boolean; metadata?: Record<string, unknown> };
        appearance?: Partial<BlockAppearance>;
      } & Record<string, unknown>) => {
        const Component = BLOCK_RENDERERS[type] as unknown as AnyRender;
        const editMode = Boolean(puck?.isEditing);
        // Every block sits in a frame carrying its appearance (and resetting the inherited one).
        const frame = appearanceFrame(appearance, editMode);
        return (
          <div className={frame.className} style={frame.style}>
            <Component {...props} editMode={editMode} site={puck?.metadata} />
          </div>
        );
      }) as AnyRender,
    },
  ]),
);

export const renderConfig = {
  components,
  root: { render: ({ children }: { children: React.ReactNode }) => <>{children}</> },
} as unknown as Config;
