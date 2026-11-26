import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireUser } from "./auth.js";
import { readCheckoutConfig } from "./checkout-config.js";
import { prisma } from "./prisma.js";

const router = Router();
const orderSchema = z.object({
  addressId: z.string().min(1),
  policyAccepted: z.literal(true),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
  }).strict()).min(1).max(30),
}).strict().superRefine(({ items }, context) => {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (ids.has(item.productId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "productId"], message: "Each product may appear only once." });
    }
    ids.add(item.productId);
  }
});

class CheckoutError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function newOrderNumber() {
  return `PJ-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

router.get("/checkout/config", async (_request, response, next) => {
  try {
    const config = await readCheckoutConfig();
    response.json({
      enabled: config.enabled && config.missing.length === 0,
      currency: config.currency,
      shippingFee: config.shippingFee,
      codFee: config.codFee,
      taxMode: config.taxMode,
      taxRateBasisPoints: config.taxRateBasisPoints,
      returnPolicy: config.returnPolicy,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      response.status(503).json({ error: "Checkout settings are unavailable. Connect the configured PostgreSQL database and try again." });
      return;
    }
    next(error);
  }
});

router.post("/checkout/orders", requireUser, async (request, response, next) => {
  const config = await readCheckoutConfig();
  if (config.missing.length > 0) {
    response.status(503).json({ error: "Checkout is not enabled until business rules are finalized." });
    return;
  }

  const parsed = orderSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Check the submitted checkout details.",
      fields: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
    return;
  }

  try {
    const { addressId, items } = parsed.data;
    const order = await prisma.$transaction(async (transaction) => {
      const account = await transaction.user.findUnique({ where: { id: request.user!.id }, select: { referredByAffiliateId: true } });
      const affiliate = account?.referredByAffiliateId
        ? await transaction.affiliateProfile.findFirst({ where: { id: account.referredByAffiliateId, isActive: true }, select: { id: true } })
        : null;
      const address = await transaction.address.findFirst({
        where: { id: addressId, userId: request.user!.id },
      });
      if (!address) throw new CheckoutError(400, "Choose one of your saved addresses.");
      if (address.countryCode !== "BD") throw new CheckoutError(400, "Cash-on-delivery orders are currently limited to Bangladesh.");

      const ids = items.map((item) => item.productId);
      const products = await transaction.product.findMany({
        where: { id: { in: ids }, status: "ACTIVE" },
        select: { id: true, name: true, slug: true, price: true, stockQuantity: true },
      });
      if (products.length !== ids.length) {
        throw new CheckoutError(400, "One or more products are no longer available.");
      }

      const productById = new Map(products.map((product) => [product.id, product]));
      let subtotal = new Prisma.Decimal(0);
      const orderItems = items.map((item) => {
        const product = productById.get(item.productId)!;
        if (product.stockQuantity < item.quantity) {
          throw new CheckoutError(409, `${product.name} does not have enough stock.`);
        }
        const lineTotal = product.price.mul(item.quantity);
        subtotal = subtotal.add(lineTotal);
        return {
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          unitPrice: product.price,
          quantity: item.quantity,
          lineTotal,
        };
      });

      for (const item of items) {
        const reserved = await transaction.product.updateMany({
          where: { id: item.productId, status: "ACTIVE", stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (reserved.count !== 1) {
          throw new CheckoutError(409, "Stock changed while placing the order. Please review your bag.");
        }
      }

      const shippingTotal = new Prisma.Decimal(config.shippingFee!);
      const codFee = new Prisma.Decimal(config.codFee!);
      const taxTotal = config.taxMode === "RATE"
        ? subtotal.mul(config.taxRateBasisPoints!).div(10000).toDecimalPlaces(2)
        : new Prisma.Decimal(0);
      const grandTotal = subtotal.add(shippingTotal).add(codFee).add(taxTotal);
      const shippingAddress: Prisma.InputJsonObject = {
        recipient: address.recipient,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        countryCode: address.countryCode,
      };

      return transaction.order.create({
        data: {
          orderNumber: newOrderNumber(),
          userId: request.user!.id,
          affiliateId: affiliate?.id,
          status: "PENDING",
          currency: config.currency,
          subtotal,
          shippingTotal,
          taxTotal,
          grandTotal,
          shippingAddress,
          policyAcceptedAt: new Date(),
          items: { create: orderItems },
          payments: {
            create: {
              provider: "CASH_ON_DELIVERY",
              status: "PENDING",
              amount: grandTotal,
              currency: config.currency,
            },
          },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          currency: true,
          subtotal: true,
          shippingTotal: true,
          taxTotal: true,
          grandTotal: true,
          placedAt: true,
          items: { select: { productName: true, quantity: true, lineTotal: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    response.status(201).json({ order });
  } catch (error) {
    if (error instanceof CheckoutError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
  }
});

export default router;
