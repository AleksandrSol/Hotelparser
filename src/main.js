import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';

// Build a likely hotel details URL for known operators.
const buildHotelUrl = (operator = '', hotelId = '') => {
  const base = operator.replace(/\/$/, '');
  // Try common URL patterns used by operators. We default to `/hotel/` path.
  return `${base}/hotel/${hotelId}`;
};

await Actor.init();

try {
  const input = await Actor.getInput() || {};
  const {
    rows = [],
    useProxy = true,
    proxyCountry = 'DE',
    maxHotels = 200,
  } = input;

  log.info(`Got ${rows.length} rows from n8n`);

  const hotels = rows
    .filter(r => r && r.id && r.operator)
    .slice(0, maxHotels);

  if (!hotels.length) {
    log.warning('No valid rows to process');
  }

  const proxyConfiguration = useProxy
    ? await Actor.createProxyConfiguration({
        countryCode: proxyCountry,
      })
    : undefined;

  const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxConcurrency: 5,
    requestHandler: async ({ request, $, log }) => {
      const data = request.userData;

      const services = [];
      const characteristics = {};

      // Try to extract JSON-LD structured data describing the hotel.
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).contents().text());
          const arr = Array.isArray(json) ? json : [json];
          const hotel = arr.find(j => j['@type'] === 'Hotel');
          if (hotel) {
            if (hotel.amenityFeature) {
              const feats = Array.isArray(hotel.amenityFeature)
                ? hotel.amenityFeature
                : [hotel.amenityFeature];
              for (const f of feats) {
                if (typeof f === 'string') services.push(f);
                else if (f.name) services.push(f.name);
              }
            }
            if (hotel.amenities) {
              const ams = Array.isArray(hotel.amenities)
                ? hotel.amenities
                : [hotel.amenities];
              for (const a of ams) {
                if (typeof a === 'string') services.push(a);
                else if (a.name) services.push(a.name);
              }
            }
            Object.assign(characteristics, {
              name: hotel.name || data.name,
              address: hotel.address || undefined,
              starRating: hotel.starRating || hotel.stars,
            });
          }
        } catch (e) {
          // Ignore JSON parsing errors.
        }
      });

      // Fallback: grab any list items that might represent services.
      if (!services.length) {
        $('li').each((_, el) => {
          const text = $(el).text().trim();
          if (text && text.length < 120) services.push(text);
        });
      }

      const item = {
        ...data,
        sourceUrl: request.url,
        resolvedBy: 'scrape',
        services: Array.from(new Set(services.map(s => s.trim()))),
        characteristics,
      };

      await Dataset.pushData(item);
    },
    failedRequestHandler: async ({ request }) => {
      const data = request.userData;
      const item = {
        ...data,
        sourceUrl: request.url,
        resolvedBy: 'error',
        services: [],
        characteristics: {},
        error: request.errorMessages.join('; '),
      };
      await Dataset.pushData(item);
    },
  });

  const requests = hotels.map(r => ({
    url: buildHotelUrl(r.operator, r.id),
    userData: {
      operator: r.operator,
      hotelId: r.id,
      name: r.name || '',
      stars: r.stars || '',
      country: r.country || '',
      resort: r.resort || '',
      rowRef: r.rowRef || r.hotelid || '',
    },
  }));

  await crawler.addRequests(requests);
  await crawler.run();

  log.info(`Processed ${requests.length} hotels`);
} finally {
  await Actor.exit();
}
