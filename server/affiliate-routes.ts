import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { Prisma } from "@prisma/client";
import { readReferralCookie, requireUser, setReferralCookie } from "./auth.js";
import { readAffiliateConfig } from "./affiliate-config.js";
import { prisma } from "./prisma.js";

const router = Router();
const referralVisitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

router.post("/referrals/visit", referralVisitLimiter, async (request, response, next) => {
  const code = typeof request.body?.code === "string" ? request.body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{8,32}$/.test(code)) {
    response.status(400).json({ error: "A valid referral code is required." });
    return;
  }

  const config = await readAffiliateConfig();
  if (!config.trackingEnabled || !config.attributionDays) {
    response.status(503).json({ error: "Referral tracking is not configured yet." });
    return;
  }

  try {
    const affiliate = await prisma.affiliateProfile.findFirst({
      where: { referralCode: code, isActive: true },
      select: { id: true },
    });
    if (!affiliate) {
      response.status(404).json({ error: "Referral code not found." });
      return;
    }

    const click = await prisma.referralClick.create({
      data: { affiliateId: affiliate.id },
      select: { id: true },
    });
    const currentAttribution = await readReferralCookie(request);
    if (config.attributionModel === "LAST_CLICK" || !currentAttribution) {
      await setReferralCookie(response, { affiliateId: affiliate.id, clickId: click.id }, config.attributionDays);
    }
    response.json({ tracked: true });
  } catch (error) {
    next(error);
  }
});

router.get("/affiliate/dashboard", requireUser, async (request, response, next) => {
  try {
    const config = await readAffiliateConfig();
    const affiliate = await prisma.affiliateProfile.findUnique({
      where: { userId: request.user!.id },
      select: { id: true, referralCode: true, isActive: true, createdAt: true },
    });
    if (!affiliate) {
      response.status(404).json({ error: "Affiliate profile not found." });
      return;
    }

    const [clicks, signups, orders, commissionSummary, payoutRequests] = await Promise.all([
      prisma.referralClick.count({ where: { affiliateId: affiliate.id } }),
      prisma.user.count({ where: { referredByAffiliateId: affiliate.id } }),
      prisma.order.count({ where: { affiliateId: affiliate.id } }),
      prisma.affiliateCommission.groupBy({
        by: ["status"],
        where: { affiliateId: affiliate.id },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.payoutRequest.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { requestedAt: "desc" },
        select: { id: true, status: true, amount: true, requestedAt: true, reviewedAt: true },
      }),
    ]);

    response.json({
      affiliate,
      metrics: {
        clicks,
        signups,
        orders,
        commissions: commissionSummary.map((item) => ({
          status: item.status,
          amount: item._sum.amount?.toString() ?? "0.00",
          count: item._count.id,
        })),
      },
      payoutRequests,
      rules: {
        trackingEnabled: config.trackingEnabled,
        commissionsEnabled: config.commissionEnabled,
        payoutRequestsEnabled: config.payoutEnabled,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/affiliate/payout-requests", requireUser, async (request, response, next) => {
  const config = await readAffiliateConfig();
  if (!config.payoutEnabled || config.minimumPayoutBdt === null) {
    response.status(503).json({ error: "Payout requests are not configured yet." });
    return;
  }

  try {
    const affiliate = await prisma.affiliateProfile.findUnique({ where: { userId: request.user!.id }, select: { id: true, isActive: true } });
    if (!affiliate || !affiliate.isActive) {
      response.status(403).json({ error: "This affiliate account cannot request a payout." });
      return;
    }

    const payout = await prisma.$transaction(async (transaction) => {
      const commissions = await transaction.affiliateCommission.findMany({
        where: { affiliateId: affiliate.id, status: "APPROVED", payoutLine: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true },
      });
      const amount = commissions.reduce((sum, commission) => sum.add(commission.amount), new Prisma.Decimal(0));
      if (amount.lessThan(config.minimumPayoutBdt!)) {
        throw Object.assign(new Error("Approved commissions do not meet the payout minimum."), { statusCode: 409 });
      }
      if (commissions.length === 0) {
        throw Object.assign(new Error("There are no approved commissions available for payout."), { statusCode: 409 });
      }

      return transaction.payoutRequest.create({
        data: {
          affiliateId: affiliate.id,
          amount,
          lines: { create: commissions.map((commission) => ({ commissionId: commission.id, amount: commission.amount })) },
        },
        select: { id: true, status: true, amount: true, requestedAt: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    response.status(201).json({ payout });
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
    if (statusCode) {
      response.status(statusCode).json({ error: (error as Error).message });
      return;
    }
    next(error);
  }
});

export default router;
