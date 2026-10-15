import "server-only";

import { CouponDuration, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { getPaymentProvider } from "./provider";

/** Coupon management for admins (not owner-scoped). Coupons are created locally and at the provider. */

export type CouponInput = {
  code: string;
  name: string;
  percentOff: number | null;
  amountOff: number | null;
  duration: CouponDuration;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  expiresAt: Date | null;
};

export class CouponError extends Error {
  constructor(readonly code: "codeTaken" | "invalid") {
    super(code);
  }
}

export async function listCoupons() {
  return db.coupon.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createCoupon(input: CouponInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new CouponError("invalid");
  if ((input.percentOff === null) === (input.amountOff === null)) throw new CouponError("invalid");
  if (await db.coupon.count({ where: { code } })) throw new CouponError("codeTaken");

  const synced = await getPaymentProvider().syncCoupon({ ...input, code });
  try {
    return await db.coupon.create({
      data: {
        ...input,
        code,
        durationInMonths: input.duration === CouponDuration.REPEATING ? input.durationInMonths : null,
        providerCouponId: synced.couponId,
        providerPromotionCodeId: synced.promotionCodeId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new CouponError("codeTaken");
    throw error;
  }
}

export async function deactivateCoupon(couponId: string) {
  const coupon = await db.coupon.update({ where: { id: couponId }, data: { isActive: false } });
  if (coupon.providerPromotionCodeId) {
    await getPaymentProvider().deactivateCoupon({ promotionCodeId: coupon.providerPromotionCodeId });
  }
}
