#!/usr/bin/env node
/**
 * Migration: clean up legacy storage fields from raster_*.json files.
 * Removes: storageSeries, params.storageCoefficient, params.volumeUnit
 *
 * Usage: node scripts/migrate-raster-cleanup.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'public', 'data');

let cleaned = 0;

for (const regionEntry of fs.readdirSync(dataDir, { withFileTypes: true })) {
  if (!regionEntry.isDirectory()) continue;
  const regionDir = path.join(dataDir, regionEntry.name);

  for (const subEntry of fs.readdirSync(regionDir, { withFileTypes: true })) {
    if (!subEntry.isDirectory()) continue;
    const subDir = path.join(regionDir, subEntry.name);

    for (const file of fs.readdirSync(subDir)) {
      if (!file.startsWith('raster_') || !file.endsWith('.json')) continue;

      const filePath = path.join(subDir, file);
      let data;
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (e) {
        console.warn(`  Skipping malformed file: ${filePath}`);
        continue;
      }

      let changed = false;

      if ('storageSeries' in data) {
        delete data.storageSeries;
        changed = true;
      }

      if (data.params) {
        if ('storageCoefficient' in data.params) {
          delete data.params.storageCoefficient;
          changed = true;
        }
        if ('volumeUnit' in data.params) {
          delete data.params.volumeUnit;
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
        const rel = path.relative(dataDir, filePath);
        console.log(`  Cleaned: ${rel}`);
        cleaned++;
      }
    }
  }
}

console.log(`\nCleanup complete: ${cleaned} file(s) updated.`);
