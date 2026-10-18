"use client";

import { createUsePuck, FieldLabel, type Config, type Field } from "@puckeditor/core";

import {
  ANIMATION_OPTIONS,
  HIDE_OPTIONS,
  SPACE_OPTIONS,
  THEME_COLOR_TOKENS,
  WIDTH_OPTIONS,
  type ColorValue,
} from "@/blocks/appearance";
import { renderConfig, BLOCK_CATEGORIES } from "@/blocks/config";
import type { LockRules } from "@/blocks/locks";
import { blockDefaults } from "@/blocks/defaults";
import {
  EMPTY_FILE,
  EMPTY_IMAGE,
  ICON_NAMES,
  SOCIAL_PLATFORMS,
  type BlockType,
  type FileValue,
  type ImageValue,
} from "@/blocks/schemas";
import { FilePicker } from "@/components/media/file-picker";
import { ImagePicker } from "@/components/media/image-picker";
import { themePalette, themeToCssVars, type Theme } from "@/themes/theme";

import { ColorField } from "./color-field";

/**
 * Editor config: the shared render config plus fields, labels and categories for Puck.
 * Labels come from next-intl (`blocks.*`), so the editor UI follows the panel language.
 */

type Translate = (key: string) => string;

const usePuck = createUsePuck();

/** Layout containers allowed inside each other: Section > Columns > content, never deeper. */
const COLUMN_DISALLOW = ["Columns", "Section"];
const SECTION_DISALLOW = ["Section"];

/** Shown on an empty page so a first-time user knows where to start (editor only). */
function EmptyCanvasHint({ text }: { text: string }) {
  const empty = usePuck((state) => state.appState.data.content.length === 0);
  if (!empty) return null;
  return (
    <div className="site-container p-6" data-testid="editor-empty-hint">
      <p className="site-placeholder px-6 text-center">{text}</p>
    </div>
  );
}

/** `lockRules` (client sites created from templates) restrict editing, moving and removing blocks. */
export function createEditorConfig(
  t: Translate,
  theme: Theme,
  lockRules: LockRules = {},
  emptyHint = "",
): Config {
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
  const file = (key: string): Field => {
    const field: Field<FileValue> = {
      type: "custom",
      label: label(key),
      render: ({ value, onChange, name }) => (
        <FieldLabel label={label(key)} el="div">
          <FilePicker value={value ?? EMPTY_FILE} onChange={onChange} id={name} />
        </FieldLabel>
      ),
    };
    return field as Field;
  };
  const palette = themePalette(theme);
  const colorLabels = {
    inherit: t("appearance.inherit"),
    custom: t("appearance.custom"),
    tokens: Object.fromEntries(
      THEME_COLOR_TOKENS.map((token) => [token, t(`appearance.tokens.${token}`)]),
    ) as Record<(typeof THEME_COLOR_TOKENS)[number], string>,
  };
  /** Colour picker field; labels come from `blocks.appearance.*` or `blocks.fields.*`. */
  const color = (key: string, scope: "appearance" | "fields" = "appearance"): Field => {
    const text = t(`${scope}.${key}`);
    const field: Field<ColorValue> = {
      type: "custom",
      label: text,
      render: ({ value, onChange, name }) => (
        <FieldLabel label={text} el="div">
          <ColorField id={name} value={value} onChange={onChange} palette={palette} labels={colorLabels} />
        </FieldLabel>
      ),
    };
    return field as Field;
  };
  const yesNo = (key: string): Field => ({
    type: "radio",
    label: label(key),
    options: [
      { label: t("options.yes"), value: true },
      { label: t("options.no"), value: false },
    ],
  });
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
  const slot = (key: string, disallow: string[]): Field => ({ type: "slot", label: label(key), disallow });

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
    Heading: {
      text: text("heading"),
      subtitle: textarea("subtitle"),
      level: {
        type: "select",
        label: label("headingLevel"),
        options: ["h1", "h2", "h3", "h4"].map((value) => ({ label: value.toUpperCase(), value })),
      },
      size: radio("size", ["sm", "md", "lg", "xl"]),
      align: radio("align", ["left", "center", "right"]),
    },
    Buttons: {
      align: radio("align", ["left", "center", "right"]),
      items: array(
        "buttons",
        {
          label: text("buttonLabel"),
          href: text("buttonHref"),
          variant: radio("variant", ["primary", "secondary"]),
        },
        { label: "", href: "", variant: "primary" },
        "label",
      ),
    },
    Quote: {
      quote: textarea("quote"),
      author: text("author"),
      role: text("role"),
      image: image("photo"),
      align: radio("align", ["left", "center"]),
    },
    Divider: {
      variant: radio("dividerStyle", ["line", "dots", "wave"]),
      width: radio("dividerWidth", ["short", "full"]),
    },
    IconList: {
      heading: text("heading"),
      columns: select("columns", []),
      items: array(
        "items",
        {
          icon: {
            type: "select",
            label: label("icon"),
            options: ICON_NAMES.map((name) => ({ label: t(`icons.${name}`), value: name })),
          },
          title: text("title"),
          text: textarea("text"),
        },
        { icon: "check", title: "", text: "" },
        "title",
      ),
    },
    Section: {
      image: image("backgroundImage"),
      overlay: radio("overlay", ["none", "light", "dark"]),
      gradient: select("gradient", ["none", "vertical", "horizontal", "diagonal"]),
      gradientFrom: color("gradientFrom", "fields"),
      gradientTo: color("gradientTo", "fields"),
      minHeight: radio("minHeight", ["auto", "half", "screen"]),
      verticalAlign: radio("verticalAlign", ["top", "center", "bottom"]),
      content: slot("content", SECTION_DISALLOW),
    },
    Pricing: {
      heading: text("heading"),
      description: textarea("description"),
      items: array(
        "plans",
        {
          name: text("name"),
          price: text("price"),
          period: text("period"),
          description: textarea("description"),
          features: textarea("features"),
          buttonLabel: text("buttonLabel"),
          buttonHref: text("buttonHref"),
          featured: yesNo("featured"),
        },
        {
          name: "",
          price: "",
          period: "",
          description: "",
          features: "",
          buttonLabel: "",
          buttonHref: "",
          featured: false,
        },
        "name",
      ),
    },
    Faq: {
      heading: text("heading"),
      items: array(
        "questions",
        { question: text("question"), answer: textarea("answer") },
        { question: "", answer: "" },
        "question",
      ),
    },
    Stats: {
      heading: text("heading"),
      items: array(
        "items",
        { value: text("value"), label: text("statLabel") },
        { value: "", label: "" },
        "label",
      ),
    },
    Logos: {
      heading: text("heading"),
      grayscale: yesNo("grayscale"),
      items: array(
        "logos",
        { image: image("image"), href: text("href") },
        { image: EMPTY_IMAGE, href: "" },
        "href",
      ),
    },
    FileDownload: {
      heading: text("heading"),
      description: textarea("description"),
      file: file("file"),
      buttonLabel: text("buttonLabel"),
    },
    Columns: {
      layout: {
        type: "select",
        label: label("layout"),
        options: ["1-1", "1-2", "2-1", "1-1-1"].map((v) => ({ label: v, value: v })),
      },
      gap: radio("gap", ["sm", "md", "lg"]),
      col1: slot("col1", COLUMN_DISALLOW),
      col2: slot("col2", COLUMN_DISALLOW),
      col3: slot("col3", COLUMN_DISALLOW),
    },
  };

  // Shared "Appearance" group at the end of every block's fields (see src/blocks/appearance.ts).
  const appearanceSelect = (key: string, values: readonly string[]): Field => ({
    type: "select",
    label: t(`appearance.${key}`),
    options: values.map((value) => ({ label: t(`appearance.options.${value}`), value })),
  });
  const appearance: Field = {
    type: "object",
    label: t("appearance.title"),
    objectFields: {
      background: color("background"),
      text: color("text"),
      paddingTop: appearanceSelect("paddingTop", SPACE_OPTIONS),
      paddingBottom: appearanceSelect("paddingBottom", SPACE_OPTIONS),
      width: appearanceSelect("width", WIDTH_OPTIONS),
      hideOn: appearanceSelect("hideOn", HIDE_OPTIONS),
      animation: appearanceSelect("animation", ANIMATION_OPTIONS),
    },
  };
  for (const type of Object.keys(fields) as BlockType[]) fields[type].appearance = appearance;

  // Column count options are numbers, not translated words.
  const columnOptions = (values: string[]) => values.map((v) => ({ label: v, value: v }));
  (fields.Gallery.columns as { options: unknown }).options = columnOptions(["2", "3", "4"]);
  (fields.ProjectList.columns as { options: unknown }).options = columnOptions(["2", "3"]);
  (fields.IconList.columns as { options: unknown }).options = columnOptions(["1", "2", "3"]);

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
          {emptyHint && <EmptyCanvasHint text={emptyHint} />}
          {children}
        </div>
      ),
    },
  } as Config;
}
