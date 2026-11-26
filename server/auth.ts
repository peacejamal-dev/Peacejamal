import type { NextFunction, Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "./prisma.js";

export const SESSION_COOKIE = "peacejamal_session";
export const REFERRAL_COOKIE = "peacejamal_referral";
const sessionKey = new TextEncoder().encode(process.env.SESSION_SECRET ?? "");
const sessionDurationSeconds = 60 * 60 * 24 * 7;

export type AuthUser = {
  id: string;
  email: string;
  role: "CUSTOMER" | "ADMIN";
};

export type ReferralAttribution = { affiliateId: string; clickId: string };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function assertSessionSecret() {
  const secret = process.env.SESSION_SECRET ?? "";
  if (Buffer.byteLength(secret) < 32 || secret.startsWith("replace-with-")) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: sessionDurationSeconds * 1000,
  };
}

function clearedCookieOptions() {
  const { maxAge, ...options } = sessionCookieOptions();
  void maxAge;
  return options;
}

export async function setSessionCookie(response: Response, userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${sessionDurationSeconds}s`)
    .sign(sessionKey);

  response.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(SESSION_COOKIE, clearedCookieOptions());
}

export async function setReferralCookie(response: Response, attribution: ReferralAttribution, days: number) {
  const token = await new SignJWT({ clickId: attribution.clickId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(attribution.affiliateId)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(sessionKey);

  response.cookie(REFERRAL_COOKIE, token, {
    ...sessionCookieOptions(),
    maxAge: days * 24 * 60 * 60 * 1000,
  });
}

export function clearReferralCookie(response: Response) {
  response.clearCookie(REFERRAL_COOKIE, clearedCookieOptions());
}

export async function readReferralCookie(request: Request): Promise<ReferralAttribution | null> {
  const token = request.cookies?.[REFERRAL_COOKIE];
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, sessionKey, { algorithms: ["HS256"] });
    const clickId = verified.payload.clickId;
    if (!verified.payload.sub || typeof clickId !== "string") return null;
    return { affiliateId: verified.payload.sub, clickId };
  } catch {
    return null;
  }
}

export async function requireUser(request: Request, response: Response, next: NextFunction) {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) {
    response.status(401).json({ error: "Sign in to continue." });
    return;
  }

  let userId: string;
  try {
    const verified = await jwtVerify(token, sessionKey, { algorithms: ["HS256"] });
    if (!verified.payload.sub) throw new Error("Session subject is missing.");
    userId = verified.payload.sub;
  } catch {
    clearSessionCookie(response);
    response.status(401).json({ error: "Your session has expired. Sign in again." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, isBanned: true },
    });

    if (!user || user.isBanned) {
      clearSessionCookie(response);
      response.status(401).json({ error: "This account cannot access the storefront." });
      return;
    }

    request.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  if (!request.user || request.user.role !== "ADMIN") {
    response.status(403).json({ error: "Administrator access is required." });
    return;
  }
  next();
}
