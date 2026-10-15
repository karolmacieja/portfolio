import type { Config } from "@puckeditor/core";

import { blockDefaults } from "./defaults";
import * as Blocks from "./render/blocks";
import type { BlockType } from "./schemas";

/**
 * Render-only Puck config shared by published sites and the editor (which adds fields and
 * labels on top, see src/components/editor/editor-config.tsx).
 */

type AnyRender = (props: Record<string, unknown>) => React.ReactElement | null;

export const BLOCK_CATEGORIES: Record<string, BlockType[]> = {
  layout: ["Hero", "Columns", "Spacer"],
  content: ["Text", "About", "Image", "Video"],
  portfolio: ["Gallery", "Project", "ProjectList"],
  profile: ["Timeline", "Skills", "Testimonials"],
  contact: ["ContactForm", "SocialLinks"],
};

const components = Object.fromEntries(
  (Object.keys(blockDefaults) as BlockType[]).map((type) => [
    type,
    {
      defaultProps: blockDefaults[type],
      render: (({
        puck,
        ...props
      }: { puck?: { isEditing?: boolean; metadata?: Record<string, unknown> } } & Record<
        string,
        unknown
      >) => {
        const Component = Blocks[type] as unknown as AnyRender;
        return <Component {...props} editMode={Boolean(puck?.isEditing)} site={puck?.metadata} />;
      }) as AnyRender,
    },
  ]),
);

export const renderConfig = {
  components,
  root: { render: ({ children }: { children: React.ReactNode }) => <>{children}</> },
} as unknown as Config;
