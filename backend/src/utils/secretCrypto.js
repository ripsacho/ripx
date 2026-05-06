const crypto = require('crypto');

const PREFIX = 'ripx:v1:';
const ALGORITHM = 'aes-256-gcm';

function getKeyMaterial() {
  return process.env.RIPX_SECRET_ENCRYPTION_KEY || process.env.SECRET_ENCRYPTION_KEY || '';
}

function getEncryptionKey() {
  const material = getKeyMaterial().trim();
  if (!material) {
    return null;
  }

  if (/^[a-f0-9]{64}$/i.test(material)) {
    return Buffer.from(material, 'hex');
  }

  try {
    const decoded = Buffer.from(material, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch (_) {
    // Fall through to deterministic derivation for human-provided secrets.
  }

  return crypto.createHash('sha256').update(material).digest();
}

function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptSecret(value) {
  if (value === null || value === undefined || value === '') {
    return value || null;
  }
  const plaintext = String(value);
  if (isEncryptedSecret(plaintext)) {
    return plaintext;
  }

  const key = getEncryptionKey();
  if (!key) {
    return plaintext;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptSecret(value) {
  if (!isEncryptedSecret(value)) {
    return value || null;
  }

  const key = getEncryptionKey();
  if (!key) {
    return null;
  }

  const payload = value.slice(PREFIX.length);
  const [ivPart, tagPart, ciphertextPart] = payload.split(':');
  if (!ivPart || !tagPart || !ciphertextPart) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (_) {
    return null;
  }
}

module.exports = {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
};
