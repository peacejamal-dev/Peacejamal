import { randomBytes } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z, ZodError } from "zod";
import {
  clearSessionCookie,
  clearReferralCookie,
  readReferralCookie,
  requireUser,
  setSessionCookie,
} from "./auth.js";
import { prisma } from "./prisma.js";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." },
});
const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, "Provide a profile field to update.");
const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  recipient: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(32),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(24).optional(),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  isDefault: z.boolean().default(false),
});

function invalidInput(error: ZodError) {
  return {
    error: "Check the submitted information.",
    fields: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  };
}

function makeReferralCode() {
  return randomBytes(8).toString("hex").toUpperCase();
}

router.post("/auth/register", authLimiter, async (request, response, next) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(invalidInput(parsed.error));
    return;
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) {
      response.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const attribution = await readReferralCookie(request);
    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
      });
      let affiliateProfile = null;
      if (attribution) {
        const referringAffiliate = await transaction.affiliateProfile.findFirst({
          where: { id: attribution.affiliateId, isActive: true, userId: { not: createdUser.id } },
          select: { id: true },
        });
        const validClick = referringAffiliate ? await transaction.referralClick.findFirst({
          where: { id: attribution.clickId, affiliateId: referringAffiliate.id, convertedUserId: null },
          select: { id: true },
        }) : null;
        if (referringAffiliate && validClick) {
          await transaction.user.update({
            where: { id: createdUser.id },
            data: { referredByAffiliateId: referringAffiliate.id },
          });
          await transaction.referralClick.update({
            where: { id: validClick.id },
            data: { convertedUserId: createdUser.id },
          });
          affiliateProfile = { referredBy: referringAffiliate.id };
        }
      }
      const ownAffiliateProfile = await transaction.affiliateProfile.create({
        data: { userId: createdUser.id, referralCode: makeReferralCode() },
        select: { referralCode: true, isActive: true },
      });
      return {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
        affiliateProfile: ownAffiliateProfile,
        referral: affiliateProfile,
      };
    });

    clearReferralCookie(response);
    await setSessionCookie(response, user.id);
    response.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, affiliateProfile: user.affiliateProfile } });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/login", authLimiter, async (request, response, next) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(invalidInput(parsed.error));
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isBanned: true,
        passwordHash: true,
        affiliateProfile: { select: { referralCode: true, isActive: true } },
      },
    });
    const passwordMatches = user?.passwordHash
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches || user.isBanned) {
      response.status(401).json({ error: "Email or password is incorrect." });
      return;
    }

    await setSessionCookie(response, user.id);
    response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        affiliateProfile: user.affiliateProfile,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", (_request, response) => {
  clearSessionCookie(response);
  response.status(204).end();
});

router.get("/auth/me", requireUser, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        affiliateProfile: { select: { referralCode: true, isActive: true } },
      },
    });
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

router.patch("/account/profile", requireUser, async (request, response, next) => {
  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(invalidInput(parsed.error));
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: request.user!.id },
      data: parsed.data,
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
    });
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

router.get("/account/addresses", requireUser, async (request, response, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: request.user!.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    response.json({ addresses });
  } catch (error) {
    next(error);
  }
});

router.post("/account/addresses", requireUser, async (request, response, next) => {
  const parsed = addressSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(invalidInput(parsed.error));
    return;
  }

  try {
    const address = await prisma.$transaction(async (transaction) => {
      if (parsed.data.isDefault) {
        await transaction.address.updateMany({
          where: { userId: request.user!.id },
          data: { isDefault: false },
        });
      }
      return transaction.address.create({
        data: { ...parsed.data, userId: request.user!.id },
      });
    });
    response.status(201).json({ address });
  } catch (error) {
    next(error);
  }
});

router.delete("/account/addresses/:addressId", requireUser, async (request, response, next) => {
  try {
    const result = await prisma.address.deleteMany({
      where: { id: request.params.addressId, userId: request.user!.id },
    });
    if (result.count === 0) {
      response.status(404).json({ error: "Address not found." });
      return;
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/account/orders", requireUser, async (request, response, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: request.user!.id },
      orderBy: { placedAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        currency: true,
        grandTotal: true,
        placedAt: true,
        items: {
          select: { productName: true, quantity: true, lineTotal: true },
        },
      },
    });
    response.json({ orders });
  } catch (error) {
    next(error);
  }
});

router.get("/account/wishlist", requireUser, async (request, response, next) => {
  try {
    const wishlist = await prisma.wishlistItem.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: "desc" },
      include: { product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } } },
    });
    response.json({ wishlist });
  } catch (error) {
    next(error);
  }
});

router.post("/account/wishlist/:productId", requireUser, async (request, response, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: request.params.productId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!product) {
      response.status(404).json({ error: "Product not found." });
      return;
    }

    const item = await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId: request.user!.id, productId: product.id } },
      create: { userId: request.user!.id, productId: product.id },
      update: {},
    });
    response.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

router.delete("/account/wishlist/:productId", requireUser, async (request, response, next) => {
  try {
    await prisma.wishlistItem.deleteMany({
      where: { userId: request.user!.id, productId: request.params.productId },
    });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
