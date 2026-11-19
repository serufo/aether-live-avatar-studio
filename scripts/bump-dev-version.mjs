import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const versionFile = path.resolve(__dirname, '../src/config/version.ts');

const content = fs.readFileSync(versionFile, 'utf8');
const majorMatch = content.match(/export const APP_DEV_VERSION_MAJOR = (\d+);/);
const minorMatch = content.match(/export const APP_DEV_VERSION_MINOR = (\d+);/);

if (!majorMatch || !minorMatch) {
  console.error(
    'Could not find APP_DEV_VERSION_MAJOR / APP_DEV_VERSION_MINOR in src/config/version.ts'
  );
  process.exit(1);
}

const major = Number(majorMatch[1]);
const currentMinor = Number(minorMatch[1]);
const nextMinor = currentMinor + 1;
const updated = content.replace(
  /export const APP_DEV_VERSION_MINOR = \d+;/,
  `export const APP_DEV_VERSION_MINOR = ${nextMinor};`
);

fs.writeFileSync(versionFile, updated, 'utf8');
console.log(`Aether dev version bumped: v${major}.${currentMinor} -> v${major}.${nextMinor}`);
