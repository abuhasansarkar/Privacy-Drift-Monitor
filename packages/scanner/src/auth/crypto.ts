import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * CREDENTIAL ENCRYPTION — Phase 17 task 17.3.
 *
 * Encrypts and decrypts sensitive website credentials (passwords, auth tokens)
 * using AES-256-GCM with authenticated tags. Plaintext credentials are encrypted
 * before persistence in `authenticated_scan_configs.encryptedSecrets` and NEVER
 * logged or leaked in API responses.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const DEFAULT_DEV_KEY = "pdm_dev_scanner_master_secret_key_32bytes!!";

function getMasterKey(): Buffer {
  const envKey = process.env.SCANNER_ENCRYPTION_KEY || DEFAULT_DEV_KEY;
  // Derive a strict 32-byte key via SHA-256
  return createHash("sha256").update(envKey).digest();
}

export interface CredentialSecrets {
  username: string;
  password: string;
  extra?: Record<string, string>;
}

/**
 * Encrypts credential secrets into an authenticated string: `ivHex:tagHex:ciphertextHex`.
 */
export function encryptCredentials(
  secrets: CredentialSecrets,
  customKey?: Buffer,
): string {
  const key = customKey ?? getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(secrets);
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext}`;
}

/**
 * Decrypts an authenticated string `ivHex:tagHex:ciphertextHex` back into `CredentialSecrets`.
 * Throws if the secret cannot be authenticated or decrypted.
 */
export function decryptCredentials(
  payload: string,
  customKey?: Buffer,
): CredentialSecrets {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted credentials format: expected iv:tag:ciphertext");
  }

  const [ivHex, tagHex, ciphertextHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const key = customKey ?? getMasterKey();

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted) as CredentialSecrets;
}
