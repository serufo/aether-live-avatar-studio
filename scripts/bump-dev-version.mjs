import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const versionFile = path.resolve(__dirname, '../src/config/version.ts');

const content = fs.readFileSync(versionFile, 'utf8');
const match = content.match(/export const APP_DEV_VERSION_NUMBER = (\d+);/);

if (!match) {
  console.error('Could not find APP_DEV_VERSION_NUMBER in src/config/version.ts');
  process.exit(1);
}

const current = Number(match[1]);
const next = current + 1;
const updated = content.replace(
  /export const APP_DEV_VERSION_NUMBER = \d+;/,
  `export const APP_DEV_VERSION_NUMBER = ${next};`
);

fs.writeFileSync(versionFile, updated, 'utf8');
console.log(`Aether dev version bumped: v${current} -> v${next}`);
