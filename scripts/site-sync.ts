import { syncSite } from '../lib/siteSync';

const siteId = process.argv[2];
if (!siteId) {
  console.error('Usage: npm run site:sync -- <siteId>');
  process.exitCode = 1;
} else {
  syncSite(siteId).then(() => console.log(`Snapshot ready: sites/${siteId}/content.md`)).catch(error => {
    console.error(error instanceof Error ? error.message : 'Site sync failed');
    process.exitCode = 1;
  });
}
