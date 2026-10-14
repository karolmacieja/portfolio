"use client";

import { FieldLabel, type Config, type Field } from "@puckeditor/core";

import { renderConfig, BLOCK_CATEGORIES } from "@/blocks/config";
import type { LockRules } from "@/blocks/locks";
import { blockDefaults } from "@/blocks/defaults";
import { EMPTY_IMAGE, SOCIAL_PLATFORMS, type BlockType, type ImageValue } from "@/blocks/schemas";
import { ImagePicker } from "@/components/media/image-picker";
import { themeToCssVars, type Theme } from "@/themes/theme";

/**
 * Editor config: the shared render config plus fields, labels and categories for Puck.
 * Labels come from next-intl (`blocks.*`), so the editor UI follows the panel language.
 */

type Translate = (key: string) => string;

/** `lockRules` (client sites created from templates) restrict editing, moving and removing blocks. */
export function createEditorConfig(t: Translate, theme: Theme, lockRules: LockRules = {}): Config {
  const label = (key: string) => t(`fields.${key}`);
  const option = (value: string) => ({ label: t(`options.${value}`), value });

  const text = (key: string): Field => ({ type: "text", label: label(key) });
  const textarea = (key: string): Field => ({ type: "textarea", label: label(key) });
  const select = (key: string, values: string[]): Field => ({
    type: "select",
    label: label(key),
    options: values.map(option),
  });
  const radio = (key: string, values: string[]): Field => ({
    type: "radio",
    label: label(key),
    options: values.map(option),
  });
  const image = (key: string): Field => {
    const field: Field<ImageValue> = {
      type: "custom",
      label: label(key),
      render: ({ value, onChange, name }) => (
        <FieldLabel label={label(key)} el="div">
          <ImagePicker value={value ?? EMPTY_IMAGE} onChange={onChange} id={name} />
        </FieldLabel>
      ),
    };
    return field as Field;
  };
  const array = (
    key: string,
    arrayFields: Record<string, Field>,
    defaultItemProps: object,
    summaryKey: string,
  ): Field => ({
    type: "array",
    label: label(key),
    arrayFields,
    defaultItemProps,
    getItemSummary: (item: Record<string, unknown>, index = 0) => {
      const summary = item[summaryKey];
      if (typeof summary === "string" && summary) return summary;
      if (summary && typeof summary === "object" && "url" in summary) return `#${index + 1}`;
      return `#${index + 1}`;
    },
  });
  const slot = (key: string): Field => ({ type: "slot", label: label(key), disallow: ["Columns"] });

  const fields: Record<BlockType, Record<string, Field>> = {
    Hero: {
      title: text("title"),
      subtitle: textarea("subtitle"),
      align: radio("align", ["left", "center"]),
      image: image("image"),
      buttonLabel: text("buttonLabel"),
      buttonHref: text("buttonHref"),
    },
    Text: { heading: text("heading"), text: textarea("text"), align: radio("align", ["left", "center"]) },
    Image: {
      image: image("image"),
      caption: text("caption"),
      width: radio("width", ["normal", "wide", "full"]),
    },
    Gallery: {
      heading: text("heading"),
      layout: radio("layout", ["grid", "masonry", "carousel"]),
      columns: select("columns", []),
      images: array(
        "images",
        { image: image("image"), caption: text("caption") },
        { image: EMPTY_IMAGE, caption: "" },
        "caption",
      ),
    },
    Project: {
      title: text("title"),
      subtitle: text("subtitle"),
      description: textarea("description"),
      images: array("images", { image: image("image") }, { image: EMPTY_IMAGE }, "image"),
      linkLabel: text("linkLabel"),
      linkHref: text("linkHref"),
    },
    ProjectList: {
      heading: text("heading"),
      columns: select("columns", []),
      items: array(
        "items",
        {
          title: text("title"),
          description: textarea("description"),
          image: image("image"),
          href: text("href"),
        },
        { title: "", description: "", image: EMPTY_IMAGE, href: "" },
        "title",
      ),
    },
    About: {
      heading: text("heading"),
      text: textarea("text"),
      image: image("image"),
      imagePosition: radio("imagePosition", ["left", "right"]),
    },
    Timeline: {
      heading: text("heading"),
      items: array(
        "items",
        {
          period: text("period"),
          title: text("title"),
          organization: text("organization"),
          description: textarea("description"),
        },
        { period: "", title: "", organization: "", description: "" },
        "title",
      ),
    },
    Skills: {
      heading: text("heading"),
      style: radio("style", ["tags", "bars"]),
      items: array(
        "items",
        { name: text("name"), level: { type: "number", label: label("level"), min: 0, max: 100 } },
        { name: "", level: 80 },
        "name",
      ),
    },
    Testimonials: {
      heading: text("heading"),
      items: array(
        "items",
        { quote: textarea("quote"), author: text("author"), role: text("role") },
        { quote: "", author: "", role: "" },
        "author",
      ),
    },
    ContactForm: {
      heading: text("heading"),
      description: textarea("description"),
      submitLabel: text("submitLabel"),
    },
    SocialLinks: {
      heading: text("heading"),
      align: radio("align", ["left", "center"]),
      items: array(
        "items",
        {
          platform: {
            type: "select",
            label: label("platform"),
            options: SOCIAL_PLATFORMS.map((p) => ({ label: p, value: p })),
          },
          url: text("url"),
        },
        { platform: "instagram", url: "" },
        "platform",
      ),
    },
    Video: { url: text("url"), caption: text("caption") },
    Spacer: { size: radio("size", ["sm", "md", "lg"]) },
    Columns: {
      layout: {
        type: "select",
        label: label("layout"),
        options: ["1-1", "1-2", "2-1", "1-1-1"].map((v) => ({ label: v, value: v })),
      },
      gap: radio("gap", ["sm", "md", "lg"]),
      col1: slot("col1"),
      col2: slot("col2"),
      col3: slot("col3"),
    },
  };

  // Column count options are numbers, not translated words.
  const columnOptions = (values: string[]) => values.map((v) => ({ label: v, value: v }));
  (fields.Gallery.columns as { options: unknown }).options = columnOptions(["2", "3", "4"]);
  (fields.ProjectList.columns as { options: unknown }).options = columnOptions(["2", "3"]);

  const components = Object.fromEntries(
    (Object.keys(blockDefaults) as BlockType[]).map((type) => [
      type,
      {
        ...renderConfig.components[type],
        label: t(`names.${type}`),
        fields: fields[type],
        resolvePermissions: (
          data: { props: { id?: string } },
          params: { permissions: Record<string, boolean> },
        ) => {
          const rule = data.props.id ? lockRules[data.props.id] : undefined;
          if (!rule) return params.permissions;
          return {
            ...params.permissions,
            ...(rule.edit === false ? { edit: false } : {}),
            ...(rule.drag === false ? { drag: false } : {}),
            ...(rule.delete === false ? { delete: false } : {}),
          };
        },
      },
    ]),
  );

  const cssVars = themeToCssVars(theme);
  return {
    components,
    categories: Object.fromEntries(
      Object.entries(BLOCK_CATEGORIES).map(([name, list]) => [
        name,
        { title: t(`categories.${name}`), components: list, defaultExpanded: true },
      ]),
    ),
    root: {
      fields: {},
      render: ({ children }: { children: React.ReactNode }) => (
        <div className="site-root min-h-dvh" style={cssVars}>
          {children}
        </div>
      ),
    },
  } as Config;
}
