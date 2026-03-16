/**
 * /api/rates.js — Live Mortgage Rate Data
 *
 * Primary source: Freddie Mac PMMS public CSV — no API key required.
 * Published every Thursday. Free for commercial use.
 * Attribution: "Source: Freddie Mac Primary Mortgage Market Survey"
 *
 * Fallback: hardcoded rates (update manually each Thursday if CSV fails)
 *
 * GET /api/rates
 */

const PMMS_URL = 'https://www.freddiemac.com/pmms/docs/historicalweeklydata.csv';

// Hardcoded fallback — update these manually each Thursday if CSV is unavailable
const FALLBACK = {
  rate30yr:    { current: 6.65, previous: 6.72, date: '2026-03-06', label: '30-Year Fixed',  unit: '%' },
  rate15yr:    { current: 5.89, previous: 5.96, date: '2026-03-06', label: '15-Year Fixed',  unit: '%' },
  rate5arm:    { current: 6.12, previous: 6.19, date: '2026-03-06', label: '5/1 ARM',        unit: '%' },
  fedFunds:    { current: 4.33, previous: 4.33, date: '2026-03-01', label: 'Fed Funds Rate', unit: '%' },
  treasury10y: { current: 4.21, previous: 4.28, date: '2026-03-10', label: '10-Yr Treasury', unit: '%' },
  _source:     'fallback — Freddie Mac CSV unavailable',
  _fetchedAt:  new Date().toISOString(),
};

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim() && !l.startsWith('//'));
  if (lines.length < 3) return null;

  // Data is oldest-first — grab last two data rows
  const prev = lines[lines.length - 2].split(',');
  const curr = lines[lines.length - 1].split(',');

  // CSV columns: Date, 30-Yr FRM, Fees, 15-Yr FRM, Fees, 5/1-Yr ARM, ...
  const parseVal = v => {
    const n = parseFloat((v || '').trim());
    return isNaN(n) ? null : +n.toFixed(2);
  };

  const dateRaw = (curr[0] || '').trim();

  return {
    rate30yr: {
      current:  parseVal(curr[1]),
      previous: parseVal(prev[1]),
      date:     dateRaw,
      label:    '30-Year Fixed',
      unit:     '%',
    },
    rate15yr: {
      current:  parseVal(curr[3]),
      previous: parseVal(prev[3]),
      date:     dateRaw,
      label:    '15-Year Fixed',
      unit:     '%',
    },
    rate5arm: {
      current:  parseVal(curr[5]),
      previous: parseVal(prev[5]),
      date:     dateRaw,
      label:    '5/1 ARM',
      unit:     '%',
    },
    // Fed funds / treasury not in PMMS — keep from fallback
    fedFunds:    FALLBACK.fedFunds,
    treasury10y: FALLBACK.treasury10y,
    _source:    'Freddie Mac Primary Mortgage Market Survey (public CSV)',
    _fetchedAt: new Date().toISOString(),
    _legal:     'Free for commercial use. Attribution: Freddie Mac PMMS',
  };
}

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const resp = await fetch(PMMS_URL);
    if (!resp.ok) throw new Error(`Freddie Mac CSV: ${resp.status}`);

    const text = await resp.text();
    const data = parseCSV(text);

    if (!data || !data.rate30yr.current) throw new Error('CSV parse failed');

    // Cache 24 hours at Vercel CDN — rates only update Thursdays
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
    return res.json(data);

  } catch (err) {
    console.error('[rates] error:', err.message);
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.json({ ...FALLBACK, _source: `fallback (${err.message})` });
  }
};
