import { getClientIp } from "@/lib/request";
import { submitContactMessage } from "@/server/contact/service";

/**
 * POST /_p/contact on a client host: the ContactForm block posts here as a plain HTML form (no JavaScript,
 * pages stay static). The answer is a 303 back to the page with #contact-sent / #contact-error, which the
 * block shows through CSS :target. "_p" can never be a page path (page segments are [a-z0-9-]).
 */

const MAX_BODY_BYTES = 32 * 1024;

function back(path: string, outcome: "sent" | "error") {
  return new Response(null, {
    status: 303,
    headers: { Location: `/${path}#contact-${outcome}`, "Cache-Control": "no-store" },
  });
}

/** The page the form was on, taken from the Referer of the same host. */
function pagePathFrom(request: Request, host: string): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return "";
  try {
    const url = new URL(referer);
    if (url.hostname !== host) return null;
    return decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "");
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: RouteContext<"/sites/[host]/_p/contact">) {
  const host = decodeURIComponent((await params).host);
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    try {
      if (new URL(origin).hostname !== host) return new Response(null, { status: 403 });
    } catch {
      return new Response(null, { status: 403 });
    }
  }
  const path = pagePathFrom(request, host);
  if (path === null) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return back(path, "error");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return back(path, "error");
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  // Honeypot filled in: a bot. Answer like a success so it learns nothing.
  if (field("website")) return back(path, "sent");

  const result = await submitContactMessage({
    host,
    path,
    name: field("name"),
    email: field("email"),
    message: field("message"),
    ip: getClientIp(request.headers),
  });
  return back(path, result === "sent" ? "sent" : "error");
}
