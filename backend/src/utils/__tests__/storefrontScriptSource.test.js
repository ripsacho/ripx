const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  clearStorefrontScriptSourceCache,
  readStorefrontScriptSource,
} = require('../storefrontScriptSource');

describe('storefrontScriptSource', () => {
  afterEach(() => {
    clearStorefrontScriptSourceCache();
  });

  it('caches script contents until the file mtime or size changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripx-script-source-'));
    const scriptPath = path.join(dir, 'storefront-script.js');
    const readSpy = jest.spyOn(fs, 'readFileSync');
    try {
      fs.writeFileSync(scriptPath, 'first', 'utf8');

      expect(readStorefrontScriptSource(scriptPath)).toBe('first');
      expect(readStorefrontScriptSource(scriptPath)).toBe('first');
      expect(readSpy).toHaveBeenCalledTimes(1);

      fs.writeFileSync(scriptPath, 'second-version', 'utf8');
      expect(readStorefrontScriptSource(scriptPath)).toBe('second-version');
      expect(readSpy).toHaveBeenCalledTimes(2);
    } finally {
      readSpy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
