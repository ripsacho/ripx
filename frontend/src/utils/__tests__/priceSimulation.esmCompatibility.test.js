import fs from 'fs';
import path from 'path';

describe('priceSimulation ESM compatibility', () => {
  it('does not use CommonJS module.exports (prevents "module is not defined" in browser)', () => {
    const filePath = path.join(__dirname, '..', 'priceSimulation.js');
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).not.toMatch(/\bmodule\.exports\b/);
  });
});
