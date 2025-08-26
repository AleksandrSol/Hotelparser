import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';

await Actor.init();

try {
  const input = await Actor.getInput() || {};
  const {
    rows = [],
    useProxy = true,
    proxyCountry = 'DE',
    resolveStrategy = 'auto',
    maxHotels = 200,
  } = input;

  log.info(`Got ${rows.length} rows from n8n`);

  const cleaned = rows
    .filter(r => r && r.name && r.id && r.operator)
    .slice(0, maxHotels)
    .map(r => ({
      operator: /coral/i.test(r.operator) ? 'Coral'
              : /anextour/i.test(r.operator) ? 'ANEXTOUR'
              : /joinup/i.test(r.operator) ? 'JoinUp'
              : 'Unknown',
      hotelId: r.id,
      name: r.name,
      stars: r.stars || '',
      country: r.country || '',
      resort: r.resort || '',
      sourceUrl: '',
      resolvedBy: 'input',
      rowRef: r.rowRef || r.hotelid || ''
    }));

  if (cleaned.length) {
    await Dataset.pushData(cleaned);
    log.info(`Pushed ${cleaned.length} items to dataset`);
  } else {
    log.warning('No valid rows to push');
  }
} finally {
  await Actor.exit();
}
