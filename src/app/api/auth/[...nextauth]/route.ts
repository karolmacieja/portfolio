import type { NextRequest } from "next/server";

import { handlers } from "@/auth";
import { withPublicOrigin } from "@/lib/public-request";

// Auth.js derives callback/redirect URLs from request.url, so it must carry the public host.
export const GET = (request: NextRequest) => handlers.GET(withPublicOrigin(request));
export const POST = (request: NextRequest) => handlers.POST(withPublicOrigin(request));
