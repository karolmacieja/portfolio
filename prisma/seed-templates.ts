import sharp, { type OverlayOptions } from "sharp";

import { block, walkBlocks, type PageContent } from "../src/blocks/content";
import type { LockRules } from "../src/blocks/locks";
import type { ImageValue } from "../src/blocks/schemas";
import { TemplateStatus, type Prisma, type PrismaClient } from "../src/generated/prisma/client";
import type { Env } from "../src/lib/env";
import { processImage } from "../src/server/media/image";
import { createStorage } from "../src/server/storage";
import type { TemplatePage } from "../src/server/templates/schema";
import { THEME_PRESETS, type Theme } from "../src/themes/theme";

/** Seed templates (photographer, designer, developer, architect) with demo content and generated images. */

type DemoImage = (name: string, colors: [string, string], size: [number, number]) => Promise<ImageValue>;
const json = (value: unknown) => value as Prisma.InputJsonObject;

const page = (
  key: string,
  path: string,
  title: string,
  blocks: ReturnType<typeof block>[],
  lockRules: LockRules = {},
): TemplatePage => ({
  key,
  path,
  title,
  content: { root: { props: {} }, content: blocks } as PageContent as TemplatePage["content"],
  lockRules,
});

async function definitions(image: DemoImage) {
  const [p1, p2, p3, p4, p5] = await Promise.all([
    image("tpl-foto-1", ["#a8a29e", "#292524"], [1600, 1000]),
    image("tpl-foto-2", ["#fecaca", "#7f1d1d"], [1000, 1400]),
    image("tpl-foto-3", ["#bfdbfe", "#1e3a8a"], [1600, 1100]),
    image("tpl-foto-4", ["#fef3c7", "#78350f"], [1200, 1200]),
    image("tpl-foto-5", ["#d9f99d", "#365314"], [1000, 1500]),
  ]);
  const [d1, d2, d3] = await Promise.all([
    image("tpl-ux-1", ["#c7d2fe", "#4338ca"], [1400, 1000]),
    image("tpl-ux-2", ["#fbcfe8", "#9d174d"], [1400, 1000]),
    image("tpl-ux-3", ["#a5f3fc", "#155e75"], [1400, 1000]),
  ]);
  const [a1, a2, a3] = await Promise.all([
    image("tpl-arch-1", ["#e7e5e4", "#44403c"], [2000, 1100]),
    image("tpl-arch-2", ["#d6d3d1", "#57534e"], [1400, 1000]),
    image("tpl-arch-3", ["#f5f5f4", "#78716c"], [1400, 1000]),
  ]);

  const fotoHero = block("Hero", {
    title: "Imię Nazwisko",
    subtitle: "Fotograf · Miasto\nPortrety, śluby, reportaż.",
    align: "left",
    image: p1,
    buttonLabel: "Zobacz galerię",
    buttonHref: "/galeria",
  });

  const developerTheme: Theme = {
    ...THEME_PRESETS.dark!,
    fonts: { heading: "jetbrains-mono", body: "inter" },
  };
  const architectTheme: Theme = {
    ...THEME_PRESETS.editorial!,
    colors: {
      ...THEME_PRESETS.editorial!.colors,
      primary: "#1c1917",
      background: "#fafaf9",
      surface: "#f5f5f4",
    },
    fonts: { heading: "fraunces", body: "inter" },
  };

  return [
    {
      slug: "fotograf",
      name: "Fotograf",
      description: "Duże zdjęcia, galeria mozaikowa i prosty kontakt.",
      category: "photography",
      tags: ["zdjęcia", "galeria", "minimalizm"],
      accessTier: "basic",
      isFeatured: true,
      isNew: false,
      theme: THEME_PRESETS.minimal!,
      pages: [
        page(
          "home",
          "",
          "Start",
          [
            fotoHero,
            block("Gallery", {
              heading: "Wybrane zdjęcia",
              layout: "masonry",
              columns: "3",
              images: [p2, p3, p4, p5].map((img) => ({ image: img, caption: "" })),
            }),
            block("About", {
              heading: "O mnie",
              text: "Kilka zdań o Tobie, Twoim stylu i doświadczeniu.",
              image: p2,
              imagePosition: "right",
            }),
            block("SocialLinks", {
              heading: "Obserwuj",
              align: "center",
              items: [
                { platform: "instagram", url: "https://instagram.com/" },
                { platform: "email", url: "mailto:kontakt@example.com" },
              ],
            }),
          ],
          // The hero anchors the layout: clients can edit it but not remove it.
          { [fotoHero.props.id]: { delete: false } },
        ),
        page("gallery", "galeria", "Galeria", [
          block("Text", { heading: "Galeria", text: "Pełna galeria zdjęć.", align: "center" }),
          block("Gallery", {
            layout: "grid",
            columns: "3",
            images: [p1, p2, p3, p4, p5].map((img) => ({ image: img, caption: "" })),
          }),
        ]),
      ],
    },
    {
      slug: "grafik-ux",
      name: "Grafik / UX",
      description: "Case studies w siatce, umiejętności i kontakt.",
      category: "design",
      tags: ["ux", "ui", "case study"],
      accessTier: "basic",
      isFeatured: false,
      isNew: true,
      theme: THEME_PRESETS.studio!,
      pages: [
        page("home", "", "Start", [
          block("Hero", {
            title: "Projektuję produkty, które ludzie lubią",
            subtitle: "UX/UI designer · badania, prototypy, design systemy",
            align: "center",
            buttonLabel: "Case studies",
            buttonHref: "#projekty",
          }),
          block("ProjectList", {
            heading: "Case studies",
            columns: "3",
            items: [
              { title: "Aplikacja bankowa", description: "Redesign onboardingu", image: d1, href: "" },
              { title: "Sklep online", description: "Ścieżka zakupowa", image: d2, href: "" },
              { title: "Panel SaaS", description: "Design system", image: d3, href: "" },
            ],
          }),
          block("Skills", {
            heading: "Narzędzia",
            style: "tags",
            items: ["Figma", "Badania UX", "Prototypowanie", "Design systemy", "Warsztaty"].map((name) => ({
              name,
              level: 80,
            })),
          }),
          block("About", {
            heading: "O mnie",
            text: "Kilka zdań o Twoim podejściu do projektowania.",
            image: d1,
            imagePosition: "left",
          }),
          block("SocialLinks", {
            heading: "",
            align: "center",
            items: [
              { platform: "behance", url: "https://behance.net/" },
              { platform: "dribbble", url: "https://dribbble.com/" },
              { platform: "linkedin", url: "https://linkedin.com/" },
            ],
          }),
        ]),
      ],
    },
    {
      slug: "programista",
      name: "Programista",
      description: "Ciemny motyw, stack technologiczny, doświadczenie i projekty open source.",
      category: "development",
      tags: ["developer", "cv", "dark"],
      accessTier: "pro",
      isFeatured: false,
      isNew: true,
      theme: developerTheme,
      pages: [
        page("home", "", "Start", [
          block("Hero", {
            title: "Cześć, piszę kod.",
            subtitle: "Full-stack developer · TypeScript, React, Node.js",
            align: "left",
            buttonLabel: "GitHub",
            buttonHref: "https://github.com/",
          }),
          block("Skills", {
            heading: "Stack",
            style: "bars",
            items: [
              { name: "TypeScript", level: 95 },
              { name: "React / Next.js", level: 90 },
              { name: "Node.js", level: 85 },
              { name: "PostgreSQL", level: 75 },
            ],
          }),
          block("Timeline", {
            heading: "Doświadczenie",
            items: [
              {
                period: "2022 – obecnie",
                title: "Senior Developer",
                organization: "Firma",
                description: "Opis roli i osiągnięć.",
              },
              { period: "2018 – 2022", title: "Developer", organization: "Software house", description: "" },
            ],
          }),
          block("Columns", {
            layout: "1-1",
            gap: "md",
            col1: [block("Text", { heading: "Open source", text: "Projekty, w których biorę udział." })],
            col2: [block("Text", { heading: "Wystąpienia", text: "Konferencje i meetupy." })],
          }),
          block("SocialLinks", {
            heading: "Kontakt",
            align: "left",
            items: [
              { platform: "github", url: "https://github.com/" },
              { platform: "linkedin", url: "https://linkedin.com/" },
              { platform: "email", url: "mailto:dev@example.com" },
            ],
          }),
        ]),
      ],
    },
    {
      slug: "architekt",
      name: "Architekt",
      description: "Elegancka typografia, duże wizualizacje i opinie klientów.",
      category: "architecture",
      tags: ["architektura", "wnętrza", "elegancki"],
      accessTier: "pro",
      isFeatured: true,
      isNew: false,
      theme: architectTheme,
      pages: [
        page("home", "", "Start", [
          block("Hero", {
            title: "Pracownia Architektury",
            subtitle: "Domy, wnętrza i przestrzenie publiczne.",
            align: "center",
          }),
          block("Image", { image: a1, caption: "", width: "full" }),
          block("Text", {
            heading: "Filozofia",
            text: "Projektujemy proste, ponadczasowe budynki dopasowane do miejsca i ludzi.",
            align: "center",
          }),
          block("Testimonials", {
            heading: "Klienci o nas",
            items: [
              { quote: "Dom, o jakim marzyliśmy.", author: "Anna i Piotr", role: "Inwestorzy prywatni" },
              { quote: "Terminowo i z wyczuciem detalu.", author: "Firma X", role: "Biuro" },
            ],
          }),
        ]),
        page("projects", "projekty", "Projekty", [
          block("Project", {
            title: "Dom nad jeziorem",
            subtitle: "2024 · 180 m²",
            description: "Opis projektu, kontekstu i rozwiązań.",
            images: [{ image: a2 }, { image: a3 }, { image: a1 }],
          }),
        ]),
      ],
    },
  ];
}

async function thumbnail(
  env: Env,
  templateId: string,
  name: string,
  theme: Theme,
  hero?: ImageValue,
): Promise<string> {
  const storage = createStorage(env);
  const [w, h] = [1280, 800];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${theme.colors.background}"/>
    <rect x="80" y="${h - 200}" width="220" height="56" rx="8" fill="${theme.colors.primary}"/>
    <text x="80" y="230" font-family="serif" font-size="88" font-weight="700" fill="${theme.colors.foreground}">${name}</text>
    <text x="80" y="300" font-family="sans-serif" font-size="32" fill="${theme.colors.muted}">portfolio</text>
  </svg>`;
  const layers: OverlayOptions[] = [];
  if (hero?.url) {
    const key = hero.url.replace(/^.*\/u\//, "u/");
    const file = await (storage as { read?: (k: string) => Promise<Buffer | null> }).read?.(key);
    if (file)
      layers.push({
        input: await sharp(file).resize(560, 560, { fit: "cover" }).toBuffer(),
        left: 660,
        top: 120,
      });
  }
  const png = await sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
  const image = await processImage(png);
  const key = `templates/${templateId}/seed.webp`;
  await storage.put(key, image.main.buffer, image.contentType);
  return storage.publicUrl(key);
}

export async function seedTemplates(db: PrismaClient, env: Env, adminId: string, image: DemoImage) {
  const templates = await definitions(image);
  for (const [position, def] of templates.entries()) {
    const draft = { pages: def.pages, theme: def.theme };
    const data = {
      name: def.name,
      description: def.description,
      category: def.category,
      tags: def.tags,
      accessTier: def.accessTier,
      position,
      isNew: def.isNew,
      isFeatured: def.isFeatured,
      status: TemplateStatus.PUBLISHED,
      draft: json(draft),
    };
    const template = await db.template.upsert({
      where: { slug: def.slug },
      update: data,
      create: { slug: def.slug, ...data },
    });

    // Re-seeding replaces the version content in place (keeps version 1 and sites pointing at it).
    const version = await db.templateVersion.upsert({
      where: { templateId_number: { templateId: template.id, number: 1 } },
      update: { pages: json(def.pages), theme: json(def.theme) },
      create: {
        templateId: template.id,
        number: 1,
        pages: json(def.pages),
        theme: json(def.theme),
        createdById: adminId,
      },
    });
    // First image used on the home page (hero, image, gallery or project list).
    let hero: ImageValue | undefined;
    walkBlocks(def.pages[0]!.content, (b) => {
      if (hero) return;
      const props = b.props as {
        image?: ImageValue;
        images?: { image: ImageValue }[];
        items?: { image?: ImageValue }[];
      };
      hero = [props.image, props.images?.[0]?.image, props.items?.[0]?.image].find((img) => img?.url);
    });
    const thumbnailUrl = await thumbnail(env, template.id, def.name, def.theme, hero);
    await db.template.update({
      where: { id: template.id },
      data: { publishedVersionId: version.id, thumbnailUrl },
    });
  }
  return templates.length;
}
