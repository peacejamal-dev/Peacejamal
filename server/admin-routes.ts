import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { readAffiliateConfig } from "./affiliate-config.js";
import { requireAdmin, requireUser } from "./auth.js";
import { readCheckoutConfig } from "./checkout-config.js";
import { prisma } from "./prisma.js";

const router = Router();
router.use(requireUser, requireAdmin);

const productInput = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(10000),
  ingredients: z.array(z.string().trim().min(1).max(100)).max(40),
  price: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  compareAtPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/).nullable(),
  stockQuantity: z.number().int().min(0).max(100000),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  isFeatured: z.boolean(),
  categoryId: z.string().min(1),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  images: z.array(z.object({ url: z.string().url().max(2048), altText: z.string().max(250).nullable(), position: z.number().int().min(0).max(100) }).strict()).max(12),
}).strict();
const categoryInput = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).nullable(),
  imageUrl: z.string().url().max(2048).nullable(),
}).strict();
const checkoutSettingsSchema = z.object({
  enabled: z.boolean(),
  shippingFeeBdt: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  codFeeBdt: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
  taxMode: z.enum(["NONE", "INCLUDED", "RATE"]),
  taxRateBps: z.number().int().min(0).max(10000).nullable(),
  returnPolicy: z.string().trim().min(1).max(10000),
}).strict();
const affiliateSettingsSchema = z.object({
  enabled: z.boolean(),
  attributionDays: z.number().int().min(1).max(365).nullable(),
  attributionModel: z.enum(["FIRST_CLICK", "LAST_CLICK"]).nullable(),
  commissionRatePercent: z.number().min(0.01).max(100).nullable(),
  commissionBasis: z.literal("ITEM_SUBTOTAL").nullable(),
  refundPolicy: z.literal("VOID_ON_REFUND").nullable(),
  commissionTriggerStatus: z.literal("DELIVERED").nullable(),
  minimumPayoutBdt: z.string().regex(/^\d+(?:\.\d{1,2})?$/).nullable(),
  payoutMethod: z.string().trim().min(1).max(80).nullable(),
}).strict();
const orderStatusSchema = z.object({ status: z.enum(["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]) }).strict();
const userUpdateSchema = z.object({ role: z.enum(["CUSTOMER", "ADMIN"]).optional(), isBanned: z.boolean().optional() }).strict().refine((data) => Object.keys(data).length > 0);
const payoutUpdateSchema = z.object({ status: z.enum(["APPROVED", "REJECTED", "PAID"]), note: z.string().trim().max(500).nullable().optional() }).strict();
const commissionReviewSchema = z.object({ status: z.enum(["APPROVED", "VOIDED"]) }).strict();

function invalidInput(issues: z.ZodError["issues"]) {
  return { error: "Check the submitted information.", fields: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
}

async function saveSettings(values: Record<string, string | number | boolean | null>) {
  await prisma.$transaction(values && Object.entries(values).map(([key, value]) => prisma.storeSetting.upsert({
    where: { key },
    create: { key, value: value === null ? Prisma.JsonNull : value },
    update: { value: value === null ? Prisma.JsonNull : value },
  })));
}

router.get("/admin/overview", async (_request, response, next) => {
  try {
    const [users, products, orders, delivered, lowStock, topProducts, recentOrders] = await Promise.all([
      prisma.user.count(),
      prisma.product.count({ where: { status: { not: "ARCHIVED" } } }),
      prisma.order.count(),
      prisma.order.aggregate({ where: { status: "DELIVERED" }, _sum: { grandTotal: true } }),
      prisma.product.count({ where: { status: "ACTIVE", stockQuantity: { lte: 5 } } }),
      prisma.orderItem.groupBy({ by: ["productId", "productName"], _sum: { quantity: true, lineTotal: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
      prisma.order.findMany({ take: 8, orderBy: { placedAt: "desc" }, select: { id: true, orderNumber: true, status: true, grandTotal: true, currency: true, placedAt: true, user: { select: { name: true, email: true } } } }),
    ]);
    response.json({
      totals: { users, products, orders, deliveredRevenue: delivered._sum.grandTotal?.toString() ?? "0", lowStock },
      topProducts: topProducts.map((item) => ({ name: item.productName, units: item._sum.quantity ?? 0, revenue: item._sum.lineTotal?.toString() ?? "0" })),
      recentOrders,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/products", async (_request, response, next) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
      include: { category: { select: { id: true, name: true } }, tags: true, images: { orderBy: { position: "asc" } } },
    });
    response.json({ products });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/products", async (request, response, next) => {
  const parsed = productInput.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  try {
    const { tags, images, ...data } = parsed.data;
    const product = await prisma.product.create({
      data: {
        ...data,
        price: new Prisma.Decimal(data.price),
        compareAtPrice: data.compareAtPrice ? new Prisma.Decimal(data.compareAtPrice) : null,
        tags: { connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) },
        images: { create: images },
      },
      include: { category: true, tags: true, images: true },
    });
    response.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/products/:productId", async (request, response, next) => {
  const parsed = productInput.partial().safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  if (Object.keys(parsed.data).length === 0) return response.status(400).json({ error: "Provide a product field to update." });
  try {
    const { tags, images, ...fields } = parsed.data;
    const data: Prisma.ProductUpdateInput = {
      ...fields,
      ...(fields.price !== undefined ? { price: new Prisma.Decimal(fields.price) } : {}),
      ...(fields.compareAtPrice !== undefined ? { compareAtPrice: fields.compareAtPrice ? new Prisma.Decimal(fields.compareAtPrice) : null } : {}),
      ...(tags !== undefined ? { tags: { set: [], connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })) } } : {}),
      ...(images !== undefined ? { images: { deleteMany: {}, create: images } } : {}),
    };
    const product = await prisma.product.update({ where: { id: request.params.productId }, data, include: { category: true, tags: true, images: true } });
    response.json({ product });
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/products/:productId", async (request, response, next) => {
  try {
    await prisma.product.update({ where: { id: request.params.productId }, data: { status: "ARCHIVED" } });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/admin/categories", async (_request, response, next) => {
  try {
    response.json({ categories: await prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }) });
  } catch (error) { next(error); }
});

router.post("/admin/categories", async (request, response, next) => {
  const parsed = categoryInput.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  try {
    const category = await prisma.category.create({ data: parsed.data });
    response.status(201).json({ category });
  } catch (error) { next(error); }
});

router.patch("/admin/categories/:categoryId", async (request, response, next) => {
  const parsed = categoryInput.partial().safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  try {
    const category = await prisma.category.update({ where: { id: request.params.categoryId }, data: parsed.data });
    response.json({ category });
  } catch (error) { next(error); }
});

router.delete("/admin/categories/:categoryId", async (request, response, next) => {
  try {
    await prisma.category.delete({ where: { id: request.params.categoryId } });
    response.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      response.status(409).json({ error: "Move or archive this category's products before deleting it." });
      return;
    }
    next(error);
  }
});

router.get("/admin/orders", async (request, response, next) => {
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  try {
    const orders = await prisma.order.findMany({
      where: status && ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"].includes(status) ? { status: status as never } : undefined,
      orderBy: { placedAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true, phone: true } }, items: true, payments: true },
    });
    response.json({ orders });
  } catch (error) { next(error); }
});

const orderTransitions: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

router.patch("/admin/orders/:orderId", async (request, response, next) => {
  const parsed = orderStatusSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  const { status } = parsed.data;
  try {
    const order = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.order.findUnique({ where: { id: request.params.orderId }, include: { items: true, commission: { include: { payoutLine: true } } } });
      if (!existing) throw Object.assign(new Error("Order not found."), { statusCode: 404 });
      if (!orderTransitions[existing.status].includes(status)) throw Object.assign(new Error("This order status transition is not allowed."), { statusCode: 409 });
      if (status === "REFUNDED" && existing.commission?.status === "PAID") {
        throw Object.assign(new Error("This affiliate commission has already been paid and needs manual reconciliation before refunding."), { statusCode: 409 });
      }

      if (status === "CANCELLED") {
        for (const item of existing.items) {
          if (item.productId) await transaction.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
        }
      }

      const updated = await transaction.order.update({ where: { id: existing.id }, data: { status }, include: { user: { select: { name: true, email: true } }, items: true } });
      if ((status === "CANCELLED" || status === "REFUNDED") && existing.commission && existing.commission.status !== "PAID") {
        await transaction.affiliateCommission.update({ where: { id: existing.commission.id }, data: { status: "VOIDED" } });
      }
      if (status === "DELIVERED" && existing.affiliateId) {
        const config = await readAffiliateConfig();
        if (config.commissionEnabled && config.commissionRatePercent && config.commissionBasis === "ITEM_SUBTOTAL") {
          const rate = new Prisma.Decimal(config.commissionRatePercent).div(100);
          const amount = existing.subtotal.mul(rate).toDecimalPlaces(2);
          await transaction.affiliateCommission.upsert({
            where: { orderId: existing.id },
            create: { affiliateId: existing.affiliateId, orderId: existing.id, status: "PENDING", basisAmount: existing.subtotal, rateApplied: rate, amount },
            update: {},
          });
        }
      }
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    response.json({ order });
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
    if (statusCode) {
      response.status(statusCode).json({ error: (error as Error).message });
      return;
    }
    next(error);
  }
});

router.get("/admin/users", async (request, response, next) => {
  const page = Math.max(1, Math.min(1000, Number(request.query.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Number(request.query.pageSize) || 25));
  const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 120) : "";
  try {
    const where = search ? { OR: [{ email: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }] } : {};
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: "desc" }, select: { id: true, name: true, email: true, phone: true, role: true, isBanned: true, createdAt: true } }),
      prisma.user.count({ where }),
    ]);
    response.json({ users, total, page, pageSize });
  } catch (error) { next(error); }
});

router.patch("/admin/users/:userId", async (request, response, next) => {
  const parsed = userUpdateSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  if (request.params.userId === request.user!.id && (parsed.data.role === "CUSTOMER" || parsed.data.isBanned === true)) {
    response.status(400).json({ error: "You cannot remove your own admin access or ban your account." });
    return;
  }
  try {
    const user = await prisma.user.update({ where: { id: request.params.userId }, data: parsed.data, select: { id: true, name: true, email: true, role: true, isBanned: true } });
    response.json({ user });
  } catch (error) { next(error); }
});

router.get("/admin/affiliates", async (_request, response, next) => {
  try {
    const affiliates = await prisma.affiliateProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true, isBanned: true } }, _count: { select: { clicks: true, referredUsers: true, orders: true, commissions: true, payoutRequests: true } } },
    });
    response.json({ affiliates });
  } catch (error) { next(error); }
});

router.get("/admin/payout-requests", async (_request, response, next) => {
  try {
    const payoutRequests = await prisma.payoutRequest.findMany({
      orderBy: { requestedAt: "desc" },
      include: { affiliate: { include: { user: { select: { name: true, email: true } } } }, lines: { include: { commission: { select: { orderId: true, amount: true } } } } },
    });
    response.json({ payoutRequests });
  } catch (error) { next(error); }
});

router.get("/admin/commissions", async (request, response, next) => {
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  try {
    const commissions = await prisma.affiliateCommission.findMany({
      where: status && ["PENDING", "APPROVED", "PAID", "VOIDED"].includes(status) ? { status: status as never } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        affiliate: { include: { user: { select: { name: true, email: true } } } },
        order: { select: { orderNumber: true, status: true, placedAt: true } },
        payoutLine: { include: { payoutRequest: { select: { status: true } } } },
      },
    });
    response.json({ commissions });
  } catch (error) { next(error); }
});

router.patch("/admin/commissions/:commissionId", async (request, response, next) => {
  const parsed = commissionReviewSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  try {
    const commission = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.affiliateCommission.findUnique({
        where: { id: request.params.commissionId },
        include: { order: { select: { status: true } }, payoutLine: true },
      });
      if (!existing) throw Object.assign(new Error("Commission not found."), { statusCode: 404 });
      if (existing.status !== "PENDING") throw Object.assign(new Error("Only pending commissions can be reviewed."), { statusCode: 409 });
      if (existing.payoutLine) throw Object.assign(new Error("This commission is already reserved for a payout."), { statusCode: 409 });
      if (parsed.data.status === "APPROVED" && existing.order.status !== "DELIVERED") {
        throw Object.assign(new Error("A commission can only be approved after its order is delivered."), { statusCode: 409 });
      }
      return transaction.affiliateCommission.update({ where: { id: existing.id }, data: { status: parsed.data.status } });
    });
    response.json({ commission });
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
    if (statusCode) {
      response.status(statusCode).json({ error: (error as Error).message });
      return;
    }
    next(error);
  }
});

router.patch("/admin/payout-requests/:payoutId", async (request, response, next) => {
  const parsed = payoutUpdateSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  try {
    const payout = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.payoutRequest.findUnique({ where: { id: request.params.payoutId }, include: { lines: true } });
      if (!existing) throw Object.assign(new Error("Payout request not found."), { statusCode: 404 });
      if (existing.status === "PAID" || existing.status === "REJECTED") throw Object.assign(new Error("This payout request has already been finalized."), { statusCode: 409 });
      if (parsed.data.status === "PAID" && existing.status !== "APPROVED") throw Object.assign(new Error("Approve a payout request before marking it paid."), { statusCode: 409 });

      if (parsed.data.status === "REJECTED") {
        await transaction.payoutLine.deleteMany({ where: { payoutRequestId: existing.id } });
      }
      if (parsed.data.status === "PAID") {
        await transaction.affiliateCommission.updateMany({ where: { payoutLine: { payoutRequestId: existing.id } }, data: { status: "PAID" } });
      }
      return transaction.payoutRequest.update({
        where: { id: existing.id },
        data: { status: parsed.data.status, note: parsed.data.note ?? undefined, reviewerId: request.user!.id, reviewedAt: new Date() },
      });
    });
    response.json({ payout });
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
    if (statusCode) {
      response.status(statusCode).json({ error: (error as Error).message });
      return;
    }
    next(error);
  }
});

router.get("/admin/settings", async (_request, response, next) => {
  try {
    const [settings, checkout, affiliate] = await Promise.all([
      prisma.storeSetting.findMany(),
      readCheckoutConfig(),
      readAffiliateConfig(),
    ]);
    response.json({ settings: Object.fromEntries(settings.map((item) => [item.key, item.value])), checkout, affiliate });
  } catch (error) { next(error); }
});

router.put("/admin/settings/checkout", async (request, response, next) => {
  const parsed = checkoutSettingsSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  if (parsed.data.enabled && parsed.data.taxMode === "RATE" && parsed.data.taxRateBps === null) {
    response.status(400).json({ error: "Tax rate is required when tax mode is RATE." });
    return;
  }
  try {
    await saveSettings({
      "checkout.enabled": parsed.data.enabled,
      "checkout.shippingFeeBdt": parsed.data.shippingFeeBdt,
      "checkout.codFeeBdt": parsed.data.codFeeBdt,
      "checkout.taxMode": parsed.data.taxMode,
      "checkout.taxRateBps": parsed.data.taxRateBps,
      "checkout.returnPolicy": parsed.data.returnPolicy,
    });
    const checkout = await readCheckoutConfig();
    if (parsed.data.enabled && checkout.missing.length > 0) {
      response.status(400).json({ error: "Checkout settings are incomplete." });
      return;
    }
    response.json({ checkout });
  } catch (error) { next(error); }
});

router.put("/admin/settings/affiliate", async (request, response, next) => {
  const parsed = affiliateSettingsSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json(invalidInput(parsed.error.issues));
  if (parsed.data.enabled && [parsed.data.attributionDays, parsed.data.attributionModel, parsed.data.commissionRatePercent, parsed.data.commissionBasis, parsed.data.refundPolicy, parsed.data.commissionTriggerStatus, parsed.data.minimumPayoutBdt, parsed.data.payoutMethod].some((value) => value === null)) {
    response.status(400).json({ error: "Complete all attribution, commission, refund, trigger, and payout rules before enabling the affiliate program." });
    return;
  }
  try {
    await saveSettings({
      "affiliate.programEnabled": parsed.data.enabled,
      "affiliate.attributionDays": parsed.data.attributionDays,
      "affiliate.attributionModel": parsed.data.attributionModel,
      "affiliate.commissionRatePercent": parsed.data.commissionRatePercent,
      "affiliate.commissionBasis": parsed.data.commissionBasis,
      "affiliate.refundPolicy": parsed.data.refundPolicy,
      "affiliate.commissionTriggerStatus": parsed.data.commissionTriggerStatus,
      "affiliate.minimumPayoutBdt": parsed.data.minimumPayoutBdt,
      "affiliate.payoutMethod": parsed.data.payoutMethod,
    });
    response.json({ affiliate: await readAffiliateConfig() });
  } catch (error) { next(error); }
});

export default router;
