import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";

function resolveKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    return createHash("sha256").update("weekplanner-dev-key").digest();
  }

  if (/^[a-fA-F0-9]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  return createHash("sha256").update(raw).digest();
}

export function encryptValue(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(12);

  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), encrypted.toString("base64"), authTag.toString("base64")].join(".");
}

export function decryptValue(payload: string): string {
  const [ivPart, dataPart, tagPart] = payload.split(".");
  if (!ivPart || !dataPart || !tagPart) {
    throw new Error("Ongeldig encrypted payload");
  }

  const key = resolveKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
