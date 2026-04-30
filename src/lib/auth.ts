import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getRequiredEnvStatus, requireEnv } from "@/lib/env";

const SESSION_COOKIE_NAME = "lsc_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
const SESSION_COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  maxAge: SESSION_TTL_SECONDS,
  path: "/",
  sameSite: "lax" as const,
};

export type OwnerSession = {
  email: string;
  expiresAt: number;
};

export function getAuthEnvStatus() {
  return getRequiredEnvStatus([
    "APP_OWNER_EMAIL",
    "AUTH_PASSWORD_HASH",
    "AUTH_SECRET",
  ]);
}

export function createPasswordHash(password: string): string {
  const iterations = 310_000;
  const salt = randomBytes(16).toString("base64url");
  const derived = pbkdf2Sync(password, salt, iterations, 32, "sha256");

  return [
    PASSWORD_HASH_ALGORITHM,
    iterations.toString(),
    salt,
    derived.toString("base64url"),
  ].join("$");
}

export function verifyOwnerPassword(password: string): boolean {
  const passwordHash = requireEnv("AUTH_PASSWORD_HASH");
  const [algorithm, iterationsRaw, salt, expectedHash] = passwordHash.split("$");

  if (algorithm !== PASSWORD_HASH_ALGORITHM || !iterationsRaw || !salt || !expectedHash) {
    throw new Error(
      `AUTH_PASSWORD_HASH must use ${PASSWORD_HASH_ALGORITHM}$iterations$salt$hash format`,
    );
  }

  const iterations = Number.parseInt(iterationsRaw, 10);

  if (!Number.isSafeInteger(iterations) || iterations < 100_000) {
    throw new Error("AUTH_PASSWORD_HASH iterations must be a safe integer >= 100000");
  }

  const derived = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const expected = Buffer.from(expectedHash, "base64url");

  return safeEqual(derived, expected);
}

export async function setOwnerSession(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, createOwnerSessionToken(), getOwnerSessionCookieOptions());
}

export async function clearOwnerSession(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...getOwnerSessionCookieOptions(),
    maxAge: 0,
  });
}

export async function getOwnerSession(): Promise<OwnerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  const secret = process.env.AUTH_SECRET;
  const expectedSignature = payload && secret ? signPayload(payload, secret) : null;

  if (
    !payload ||
    !signature ||
    !expectedSignature ||
    !safeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<OwnerSession>;
    const ownerEmail = process.env.APP_OWNER_EMAIL;
    const now = Math.floor(Date.now() / 1000);

    if (
      typeof parsed.email !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now ||
      !ownerEmail ||
      parsed.email !== ownerEmail
    ) {
      return null;
    }

    return {
      email: parsed.email,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function requireOwnerSession(): Promise<OwnerSession> {
  const session = await getOwnerSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export function getOwnerSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function createOwnerSessionToken(): string {
  const email = requireEnv("APP_OWNER_EMAIL");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ email, expiresAt })).toString("base64url");
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function getOwnerSessionCookieOptions() {
  return {
    ...SESSION_COOKIE_BASE_OPTIONS,
    secure: process.env.NODE_ENV === "production",
  };
}

function signPayload(payload: string, secret = requireEnv("AUTH_SECRET")): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  return timingSafeEqual(left, right);
}
