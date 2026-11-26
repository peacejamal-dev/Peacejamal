import { prisma } from "./prisma.js";

const settingKeys = [
  "affiliate.programEnabled",
  "affiliate.attributionDays",
  "affiliate.attributionModel",
  "affiliate.commissionRatePercent",
  "affiliate.commissionBasis",
  "affiliate.refundPolicy",
  "affiliate.commissionTriggerStatus",
  "affiliate.minimumPayoutBdt",
  "affiliate.payoutMethod",
] as const;

function parseAttributionDays(value: string | undefined) {
  if (!value || !/^\d{1,3}$/.test(value)) return null;
  const days = Number(value);
  return days >= 1 && days <= 365 ? days : null;
}

function parseRatePercent(value: string | undefined) {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const rate = Number(value);
  return rate > 0 && rate <= 100 ? rate : null;
}

function parseMinimumPayout(value: string | undefined) {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  return amount > 0 ? amount : null;
}

export async function readAffiliateConfig() {
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

  const enabled = value("affiliate.programEnabled", process.env.AFFILIATE_PROGRAM_ENABLED)?.toLowerCase() === "true";
  const attributionDays = parseAttributionDays(value("affiliate.attributionDays", process.env.REFERRAL_ATTRIBUTION_DAYS));
  const attributionModelValue = value("affiliate.attributionModel", process.env.REFERRAL_ATTRIBUTION_MODEL)?.toUpperCase();
  const attributionModel = attributionModelValue === "FIRST_CLICK" || attributionModelValue === "LAST_CLICK"
    ? attributionModelValue
    : null;
  const commissionRatePercent = parseRatePercent(value("affiliate.commissionRatePercent", process.env.AFFILIATE_COMMISSION_RATE_PERCENT));
  const commissionBasisValue = value("affiliate.commissionBasis", process.env.AFFILIATE_COMMISSION_BASIS)?.toUpperCase();
  const commissionBasis = commissionBasisValue === "ITEM_SUBTOTAL" ? commissionBasisValue : null;
  const refundPolicyValue = value("affiliate.refundPolicy", process.env.AFFILIATE_REFUND_POLICY)?.toUpperCase();
  const refundPolicy = refundPolicyValue === "VOID_ON_REFUND" ? refundPolicyValue : null;
  const triggerStatusValue = value("affiliate.commissionTriggerStatus", process.env.AFFILIATE_COMMISSION_TRIGGER_STATUS)?.toUpperCase();
  const commissionTriggerStatus = triggerStatusValue === "DELIVERED" ? triggerStatusValue : null;
  const minimumPayoutBdt = parseMinimumPayout(value("affiliate.minimumPayoutBdt", process.env.AFFILIATE_MINIMUM_PAYOUT_BDT));
  const payoutMethod = value("affiliate.payoutMethod", process.env.AFFILIATE_PAYOUT_METHOD)?.trim() || null;

  return {
    attributionDays,
    attributionModel,
    commissionRatePercent,
    commissionBasis,
    refundPolicy,
    commissionTriggerStatus,
    minimumPayoutBdt,
    payoutMethod,
    trackingEnabled: enabled && attributionDays !== null && attributionModel !== null,
    commissionEnabled: enabled && attributionDays !== null && attributionModel !== null && commissionRatePercent !== null && commissionBasis !== null && refundPolicy !== null && commissionTriggerStatus !== null,
    payoutEnabled: enabled && minimumPayoutBdt !== null && payoutMethod !== null,
  };
}
