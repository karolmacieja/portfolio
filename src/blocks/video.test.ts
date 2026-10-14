import { describe, expect, it } from "vitest";

import { parseVideoUrl } from "./video";

describe("parseVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://player.vimeo.com/video/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
  ])("%s", (input, embedUrl) => {
    expect(parseVideoUrl(input)?.embedUrl).toBe(embedUrl);
  });

  it.each([
    "",
    "not a url",
    "javascript:alert(1)",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    'https://www.youtube.com/watch?v=dQw4w9WgXc"',
  ])("rejects %j", (input) => {
    expect(parseVideoUrl(input)).toBeNull();
  });
});
