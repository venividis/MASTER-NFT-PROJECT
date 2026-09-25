#!/usr/bin/env node
// The simulator uses the production local deployment path and its immutable edition record.
process.env.MASTER_INSTANCE ||= 'prism-cathedral';
process.env.ANIMA_PRISM_SIMULATOR = '1';
await import('./master-local.mjs');
