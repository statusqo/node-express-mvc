/**
 * AES-256-GCM symmetric encryption for sensitive values stored in the database
 * (e.g. Zoom OAuth access/refresh tokens).
 *
 * Key is loaded from ZOOM_TOKEN_ENCRYPTION_KEY (base64-encoded 32 bytes).
 * If no key is configured the helpers are transparent no-ops, preserving
 * backward-compatibility with unencrypted existing records.
 *
 * Encrypted format: "enc:" + base64( iv[12] || authTag[16] || ciphertext )
 * Plain values (no "enc:" prefix) are returned as-is by decrypt(), so existing
 * plaintext records continue to work after the key is first introduced.
 */

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const ENC_PREFIX = "enc:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey() {
  const raw = process.env.ZOOM_TOKEN_ENCRYPTION_KEY;
  if (!raw || !raw.trim()) return null;
  const buf = Buffer.from(raw.trim(), "base64");
  if (buf.length !== 32) {
    throw new Error(
      "ZOOM_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes (44 base64 chars). " +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  return buf;
}

/**
 * Encrypt a string. Returns the encrypted "enc:..." value.
 * If no key is configured, returns the original value unchanged.
 * @param {string|null} text
 * @returns {string|null}
 */
function encrypt(text) {
  if (text == null) return text;
  const key = getKey();
  if (!key) return text;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypt an encrypted "enc:..." value. Returns the original plaintext.
 * If the value is not in encrypted format, returns it unchanged (plaintext
 * records from before encryption was enabled continue to work).
 * @param {string|null} text
 * @returns {string|null}
 */
function decrypt(text) {
  if (text == null) return text;
  if (!String(text).startsWith(ENC_PREFIX)) return text; // not encrypted — pass through
  const key = getKey();
  if (!key) {
    // Key not configured but value looks encrypted — cannot decrypt, return null
    return null;
  }
  try {
    const buf = Buffer.from(String(text).slice(ENC_PREFIX.length), "base64");
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
