import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { products } from "../src/data/products.ts";

const prisma = new PrismaClient();

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function seed() {
  for (const [index, product] of products.entries()) {
    const categorySlug = slugify(product.category);
    const category = await prisma.category.upsert({
      where: { slug: categorySlug },
      create: { name: product.category, slug: categorySlug },
      update: { name: product.category },
    });
    const tag = { where: { name: product.tag }, create: { name: product.tag } };
    const productData = {
      name: product.name,
      slug: slugify(product.name),
      description: product.description,
      ingredients: product.details,
      price: product.price.toFixed(2),
      stockQuantity: product.stock === "Low stock" ? 4 : 24,
      status: "ACTIVE" as const,
      isFeatured: index < 3,
      categoryId: category.id,
    };

    await prisma.product.upsert({
      where: { id: product.id },
      create: {
        id: product.id,
        ...productData,
        images: { create: { url: product.image, altText: product.imageAlt, position: 0 } },
        tags: { connectOrCreate: [tag] },
      },
      update: {
        ...productData,
        images: { deleteMany: {}, create: { url: product.image, altText: product.imageAlt, position: 0 } },
        tags: { set: [], connectOrCreate: [tag] },
      },
    });
  }

  console.log(`Seeded ${products.length} sample products and their categories.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Database seed failed", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
