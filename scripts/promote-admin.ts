import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.argv[2]?.trim().toLowerCase();

async function promoteAdmin() {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: npm run db:promote-admin -- user@example.com");
  }

  const result = await prisma.user.updateMany({
    where: { email },
    data: { role: "ADMIN" },
  });
  if (result.count !== 1) {
    throw new Error("No account with that email exists. Register the account before promoting it.");
  }

  console.log("Administrator role granted.");
}

promoteAdmin()
  .catch((error: unknown) => {
    console.error("Admin promotion failed", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
