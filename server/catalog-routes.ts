import { Router } from "express";
import { prisma } from "./prisma.js";

const router = Router();

router.get("/products", async (_request, response, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        ingredients: true,
        price: true,
        stockQuantity: true,
        isFeatured: true,
        category: { select: { name: true } },
        tags: { select: { name: true } },
        images: { orderBy: { position: "asc" }, select: { url: true, altText: true }, take: 1 },
      },
    });
    response.json({ products });
  } catch (error) {
    next(error);
  }
});

export default router;
