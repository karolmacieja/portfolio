/** Crawlers, previews and headless browsers: not counted as visits. Conservative substring match. */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|pingdom|curl|wget|python|httpclient|java\/|go-http|node-fetch|axios|facebookexternalhit|embedly|whatsapp|telegram/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || userAgent.length < 10 || BOT_PATTERN.test(userAgent);
}
