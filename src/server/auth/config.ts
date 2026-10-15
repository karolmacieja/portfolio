import "server-only";

import { randomBytes } from "node:crypto";

import { PrismaAdapter } from "@auth/prisma-adapter";
import { CredentialsSignin, type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import type { Role } from "@/generated/prisma/enums";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getClientIp } from "@/lib/request";
import { getMailer } from "@/server/mail";
import { buildLinkMail } from "@/server/mail/templates";
import { getRateLimiter, RATE_LIMITS } from "@/server/rate-limit/limiter";

import { consumeImpersonationToken, isImpersonationActive } from "@/server/admin/impersonation";

import { AccountBlockedError, InvalidCredentialsError, RateLimitedError } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import { signInSchema } from "./schemas";

/** How often a JWT re-reads role/blocked state from the database. */
const TOKEN_REFRESH_MS = 5 * 60 * 1000;

// Verified against when the user doesn't exist, so unknown emails can't be detected by timing.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

function localeFromRequest(request: Request): string {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return match?.[1] ?? defaultLocale;
}

function buildProviders(): Provider[] {
  const env = getEnv();
  const providers: Provider[] = [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentialsError();
        const { email, password } = parsed.data;

        const limiter = getRateLimiter();
        const ip = getClientIp(request.headers);
        const [byEmail, byIp] = await Promise.all([
          limiter.hit(
            `signin:email:${email}`,
            RATE_LIMITS.signInPerEmail.limit,
            RATE_LIMITS.signInPerEmail.windowMs,
          ),
          limiter.hit(`signin:ip:${ip}`, RATE_LIMITS.signInPerIp.limit, RATE_LIMITS.signInPerIp.windowMs),
        ]);
        if (!byEmail.allowed || !byIp.allowed) throw new RateLimitedError();

        const user = await db.user.findUnique({ where: { email } });
        const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
        if (!user || !user.passwordHash || !valid) throw new InvalidCredentialsError();
        if (user.blockedAt) throw new AccountBlockedError();

        await limiter.reset(`signin:email:${email}`);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    // Staff signing in as a client with a single-use token from the admin panel (audited there).
    Credentials({
      id: "impersonation",
      credentials: { token: {} },
      async authorize(raw) {
        const token = typeof raw?.token === "string" ? raw.token : "";
        const result = await consumeImpersonationToken(token);
        if (!result) throw new InvalidCredentialsError();
        return result;
      },
    }),
    {
      id: "email",
      type: "email",
      name: "Email",
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url, request }) {
        const { limit, windowMs } = RATE_LIMITS.magicLinkPerEmail;
        const result = await getRateLimiter().hit(`magic:${identifier}`, limit, windowMs);
        if (!result.allowed) throw new Error("Magic link rate limit exceeded");

        const requested = localeFromRequest(request);
        const mail = await buildLinkMail({
          kind: "magicLink",
          to: identifier,
          url,
          locale: isLocale(requested) ? requested : defaultLocale,
          brand: env.BRAND_NAME,
        });
        await getMailer().send(mail);
      },
    },
  ];

  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        // Google only returns verified addresses, so linking to an existing account is safe.
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  return providers;
}

export function isGoogleEnabled(): boolean {
  const env = getEnv();
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

export function buildAuthConfig(): NextAuthConfig {
  return {
    adapter: PrismaAdapter(db as unknown as Parameters<typeof PrismaAdapter>[0]),
    // JWT is required by the Credentials provider; role/blocked state is refreshed periodically below.
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    secret: getEnv().AUTH_SECRET,
    // Multi-host app (app./admin./custom domains): derive URLs from the request Host header.
    trustHost: true,
    providers: buildProviders(),
    logger: {
      error(error) {
        // Failed password sign-ins are expected and already rate limited; don't flood the logs.
        if (error instanceof CredentialsSignin) return;
        console.error("[auth]", error);
      },
    },
    pages: {
      signIn: "/login",
      verifyRequest: "/login/check-email",
      error: "/login",
    },
    callbacks: {
      async signIn({ user, account }) {
        if (account?.type === "credentials") return true;
        if (!user.email) return false;
        const existing = await db.user.findUnique({ where: { email: user.email.toLowerCase() } });
        return !existing?.blockedAt;
      },
      async jwt({ token, user, trigger }) {
        const now = Date.now();
        // Impersonation: set on that sign-in only, cleared by any other sign-in, ends at its expiry.
        if (user) {
          if (user.impersonation) token.impersonation = user.impersonation;
          else delete token.impersonation;
        }
        if (token.impersonation && now > token.impersonation.expiresAt) return null;
        const userId = user?.id ?? token.sub;
        const stale = !token.refreshedAt || now - token.refreshedAt > TOKEN_REFRESH_MS;
        if (!userId || !(user || trigger === "update" || stale)) return token;

        const dbUser = await db.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, blockedAt: true, name: true, email: true, locale: true },
        });
        // Deleted or blocked users lose their session on the next refresh.
        if (!dbUser || dbUser.blockedAt) return null;
        if (token.impersonation && !(await isImpersonationActive(token.impersonation.sessionId))) return null;

        token.sub = dbUser.id;
        token.role = dbUser.role;
        token.name = dbUser.name;
        token.email = dbUser.email;
        token.locale = dbUser.locale;
        token.refreshedAt = now;
        return token;
      },
      session({ session, token }) {
        if (token.sub) session.user.id = token.sub;
        session.user.role = token.role as Role;
        session.user.locale = token.locale ?? defaultLocale;
        if (token.impersonation) session.user.impersonation = token.impersonation;
        return session;
      },
    },
    events: {
      async linkAccount({ user, account }) {
        // OAuth/email sign-ins prove ownership of the address.
        if (account.type !== "credentials" && user.id) {
          await db.user.updateMany({
            where: { id: user.id, emailVerified: null },
            data: { emailVerified: new Date() },
          });
        }
      },
    },
  };
}
