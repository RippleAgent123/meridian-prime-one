/**
 * /api/refresh-market.js — Weekly cache warmer (Vercel Cron)
 *
 * Runs every Monday at 6 AM (set in vercel.json).
 * Pre-fetches market data for all tracked zip codes so users
 * always get instant responses from CDN cache.
 *
 * Also callable manually: GET /api/refresh-market?secret=YOUR_CRON_SECRET
 * Add CRON_SECRET to Vercel env vars to protect this endpoint.
 */

// DEMO MODE — only 2 zips to stay within 50 req/month free tier.
// Expand this list when upgrading to RentCast Starter ($39/mo = 1,000 req).
const TRACKED_ZIPS = [
  '60402', // Berwyn  — primary demo zip
  '60804', // Cicero  — secondary demo zip
];

export default async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.query.secret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const results = [];
  for (const zip of TRACKED_ZIPS) {
    try {
      const resp = await fetch(`${base}/api/market?zip=${zip}`);
      const data = await resp.json();
      results.push({ zip, status: resp.status, areaName: data.areaName, price: data.medianPrice });
    } catch (err) {
      results.push({ zip, status: 'error', error: err.message });
    }
  }

  return res.json({ refreshed: results.length, timestamp: new Date().toISOString(), results });
};
