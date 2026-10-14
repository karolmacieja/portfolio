import { EMPTY_IMAGE, type BlockProps, type BlockType } from "./schemas";

/** Props of a freshly inserted block (also used by templates/seed). */
export const blockDefaults: { [K in BlockType]: BlockProps[K] } = {
  Hero: { title: "", subtitle: "", align: "center", image: EMPTY_IMAGE, buttonLabel: "", buttonHref: "" },
  Text: { heading: "", text: "", align: "left" },
  Image: { image: EMPTY_IMAGE, caption: "", width: "normal" },
  Gallery: { heading: "", layout: "grid", columns: "3", images: [] },
  Project: { title: "", subtitle: "", description: "", images: [], linkLabel: "", linkHref: "" },
  ProjectList: { heading: "", columns: "3", items: [] },
  About: { heading: "", text: "", image: EMPTY_IMAGE, imagePosition: "left" },
  Timeline: { heading: "", items: [] },
  Skills: { heading: "", style: "tags", items: [] },
  Testimonials: { heading: "", items: [] },
  ContactForm: { heading: "", description: "", submitLabel: "" },
  SocialLinks: { heading: "", align: "center", items: [] },
  Video: { url: "", caption: "" },
  Spacer: { size: "md" },
  Columns: { layout: "1-1", gap: "md", col1: [], col2: [], col3: [] },
};
