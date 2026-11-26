import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { assertSessionSecret } from "./auth.js";
import accountRoutes from "./routes.js";
import checkoutRoutes from "./checkout-routes.js";
import affiliateRoutes from "./affiliate-routes.js";
import adminRoutes from "./admin-routes.js";
import catalogRoutes from "./catalog-routes.js";
import { prisma } from "./prisma.js";

assertSessionSecret();

const app = express();
const allowedOrigins = new Set(
  (process.env.WEB_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.disable("x-powered-by");
app.use(helmet());
app.use((request, response, next) => {
  const origin = request.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    response.status(403).json({ error: "This origin cannot access the API." });
    return;
  }
  next();
});
app.use(cors({ origin: [...allowedOrigins], credentials: true }));
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});
app.use("/api", accountRoutes);
app.use("/api", checkoutRoutes);
app.use("/api", affiliateRoutes);
app.use("/api", catalogRoutes);
app.use("/api", adminRoutes);
app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API route not found." });
});
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("API request failed", error instanceof Error ? error.name : "UnknownError");
  response.status(500).json({ error: "Something went wrong. Please try again." });
});

const port = Number(process.env.API_PORT ?? 4000);
const server = app.listen(port, () => {
  console.log(`Peacejamal API listening on port ${port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
