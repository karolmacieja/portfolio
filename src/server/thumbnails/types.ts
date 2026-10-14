/** Renders a page into a PNG screenshot for template thumbnails. Implementations: mock, playwright. */
export interface ThumbnailRenderer {
  readonly name: string;
  render(input: { url: string; title: string }): Promise<Buffer>;
}

export const THUMBNAIL_VIEWPORT = { width: 1280, height: 800 } as const;
