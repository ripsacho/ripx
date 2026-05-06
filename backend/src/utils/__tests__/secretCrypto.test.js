const { decryptSecret, encryptSecret, isEncryptedSecret } = require('../secretCrypto');

describe('secretCrypto', () => {
  const originalKey = process.env.RIPX_SECRET_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.RIPX_SECRET_ENCRYPTION_KEY;
    } else {
      process.env.RIPX_SECRET_ENCRYPTION_KEY = originalKey;
    }
  });

  it('keeps plaintext when no encryption key is configured', () => {
    delete process.env.RIPX_SECRET_ENCRYPTION_KEY;

    expect(encryptSecret('plain-secret')).toBe('plain-secret');
    expect(decryptSecret('plain-secret')).toBe('plain-secret');
  });

  it('encrypts and decrypts secrets when a key is configured', () => {
    process.env.RIPX_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    const encrypted = encryptSecret('sensitive-value');

    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain('sensitive-value');
    expect(decryptSecret(encrypted)).toBe('sensitive-value');
  });

  it('does not decrypt encrypted values without a key', () => {
    process.env.RIPX_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
    const encrypted = encryptSecret('hidden');
    delete process.env.RIPX_SECRET_ENCRYPTION_KEY;

    expect(decryptSecret(encrypted)).toBeNull();
  });
});
