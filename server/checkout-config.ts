import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const settingKeys = [
  "checkout.enabled",
  "checkout.shippingFeeBdt",
  "checkout.codFeeBdt",
  "checkout.taxMode",
  "checkout.taxRateBps",
  "checkout.returnPolicy",
] as const;

export type CheckoutConfig = {
  enabled: boolean;
  currency: "BDT";
  shippingFee: string | null;
  codFee: string | null;
  taxMode: "NONE" | "INCLUDED" | "RATE" | null;
  taxRateBasisPoints: number | null;
  returnPolicy: string | null;
  missing: string[];
};

function parseFee(value: string | undefined) {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  try {
    const fee = new Prisma.Decimal(value);
    return fee.greaterThanOrEqualTo(0) ? fee.toFixed(2) : null;
  } catch {
    return null;
  }
}

export async function readCheckoutConfig(): Promise<CheckoutConfig> {
  const settings = await prisma.storeSetting.findMany({ where: { key: { in: [...settingKeys] } } });
  const stored = new Map(settings.map((setting) => [setting.key, setting.value]));
  const value = (key: typeof settingKeys[number], envValue: string | undefined) => {
    if (!stored.has(key)) return envValue;
    const storedValue = stored.get(key);
    if (typeof storedValue === "string" || typeof storedValue === "number" || typeof storedValue === "boolean") {
      return String(storedValue);
    }
    return undefined;
  };

  const shippingFee = parseFee(value("checkout.shippingFeeBdt", process.env.SHIPPING_FEE_BDT));
  const codFee = parseFee(value("checkout.codFeeBdt", process.env.COD_FEE_BDT));
  const rawTaxMode = value("checkout.taxMode", process.env.TAX_MODE)?.toUpperCase();
  const taxMode = rawTaxMode === "NONE" || rawTaxMode === "INCLUDED" || rawTaxMode === "RATE"
    ? rawTaxMode
    : null;
  const rawTaxRate = value("checkout.taxRateBps", process.env.TAX_RATE_BPS);
  const taxRateBasisPoints = rawTaxRate && /^\d{1,5}$/.test(rawTaxRate)
    ? Number(rawTaxRate)
    : null;
  const returnPolicy = value("checkout.returnPolicy", process.env.RETURN_POLICY)?.trim() || null;
  const enabled = value("checkout.enabled", process.env.CHECKOUT_ENABLED)?.toLowerCase() === "true";
  const missing: string[] = [];

  if (!enabled) missing.push("CHECKOUT_ENABLED must be true after business rules are finalized.");
  if (shippingFee === null) missing.push("SHIPPING_FEE_BDT must be a non-negative amount.");
  if (codFee === null) missing.push("COD_FEE_BDT must be a non-negative amount.");
  if (!taxMode) missing.push("TAX_MODE must be NONE, INCLUDED, or RATE.");
  if (taxMode === "RATE" && taxRateBasisPoints === null) missing.push("TAX_RATE_BPS is required when TAX_MODE is RATE.");
  if (taxRateBasisPoints !== null && taxRateBasisPoints > 10000) missing.push("TAX_RATE_BPS cannot exceed 10000.");
  if (!returnPolicy) missing.push("RETURN_POLICY must be set before checkout is enabled.");

  return {
    enabled,
    currency: "BDT",
    shippingFee,
    codFee,
    taxMode,
    taxRateBasisPoints,
    returnPolicy,
    missing,
  };
}
