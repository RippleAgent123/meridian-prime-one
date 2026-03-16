// api/create-folders.js — Create Gmail labels / Outlook mail folders per active deal
// POST /api/create-folders — body: { deals: [{address, client}] }

function parseCookie(cookieStr, name) {
  if (!cookieStr) return null;
  const m = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getSession(sessionId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !sessionId) return null;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_connections?session_id=eq.${encodeURIComponent(sessionId)}&limit=1`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

async function createGmailLabel(token, name) {
  // Check existing labels first to avoid duplicates
  const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const existing = await listRes.json();
  if (existing.labels?.some(l => l.name === name)) return { status: 'exists', name };

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      labelListVisibility:   'labelShow',
      messageListVisibility: 'show',
    }),
  });
  return res.json();
}

async function createOutlookFolder(token, name) {
  // Check existing folders first
  const listRes = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const existing = await listRes.json();
  if (existing.value?.some(f => f.displayName === name)) return { status: 'exists', displayName: name };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: name }),
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sessionId = parseCookie(req.headers.cookie, 'meridian_session');
  if (!sessionId) return res.status(401).json({ error: 'Not connected' });

  const session = await getSession(sessionId);
  if (!session) return res.status(401).json({ error: 'Session expired — reconnect email' });

  const { deals } = req.body || {};
  if (!Array.isArray(deals) || !deals.length) {
    return res.status(400).json({ error: 'deals array required' });
  }

  const results = [];
  for (const deal of deals) {
    const addr   = (deal.address || 'Unknown').split(',')[0].trim();
    const client = (deal.client  || 'Client').trim();
    const label  = `Meridian — ${addr} · ${client}`;

    try {
      let r;
      if (session.provider === 'gmail') {
        r = await createGmailLabel(session.access_token, label);
      } else {
        r = await createOutlookFolder(session.access_token, label);
      }
      const status = r.status === 'exists' ? 'exists' : (r.error ? 'error' : 'created');
      results.push({ deal: addr, label, status });
    } catch (e) {
      results.push({ deal: addr, label, status: 'error', detail: e.message });
    }
  }

  return res.status(200).json({ results, provider: session.provider });
}
