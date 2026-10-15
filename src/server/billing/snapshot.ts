import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/** The user's billing profile at payment time, stored on the payment for its invoice. */
export async function billingSnapshot(userId: string) {
  const profile = await db.billingProfile.findUnique({ where: { userId } });
  if (!profile) return Prisma.JsonNull;
  const { id: _id, userId: _userId, createdAt: _c, updatedAt: _u, ...data } = profile;
  return { ...data, taxIdVerifiedAt: data.taxIdVerifiedAt?.toISOString() ?? null } as Prisma.InputJsonObject;
}
