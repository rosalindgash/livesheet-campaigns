import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

import { requireEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTED_TOKEN_VERSION = "v1";
const IV_BYTES = 12;

export function encryptToken(token: string): string {
  const key = getTokenEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_TOKEN_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptToken(encryptedToken: string): string {
  const [version, ivRaw, authTagRaw, ciphertextRaw] = encryptedToken.split(":");

  if (
    version !== ENCRYPTED_TOKEN_VERSION ||
    !ivRaw ||
    !authTagRaw ||
    !ciphertextRaw
  ) {
    throw new Error("Encrypted token has an unsupported format.");
  }

  const key = getTokenEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivRaw, "base64url"));

  decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

function getTokenEncryptionKey(): Buffer {
  const rawKey = requireEnv("TOKEN_ENCRYPTION_KEY").trim();
  const candidates = [
    Buffer.from(rawKey, "base64"),
    Buffer.from(rawKey, "base64url"),
    Buffer.from(rawKey, "utf8"),
  ];
  const key = candidates.find((candidate) => candidate.byteLength === 32);

  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes. Generate one with crypto.randomBytes(32).toString('base64').",
    );
  }

  return key;
}
