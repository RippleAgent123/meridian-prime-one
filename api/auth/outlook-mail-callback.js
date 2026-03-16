// api/auth/outlook-mail-callback.js — Outlook OAuth callback
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseUpsert(data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/agent_connections`, {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(data),
  });
}

export default async function handler(req, res) {
  const CLIENT_ID    = process.env.MICROSOFT_CLIENT_ID;
  const CLIENT_SECRET= process.env.MICROSOFT_CLIENT_SECRET;
  const TENANT_ID    = process.env.MICROSOFT_TENANT_ID || 'common';
  const APP_URL      = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';
  const REDIRECT_URI = `${APP_URL}/api/auth/outlook-mail-callback`;

  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(302,
      `/smart-calendar.html?auth=error&provider=outlook&reason=${encodeURIComponent(error || 'no_code')}`
    );
  }

  let tokens;
  try {
    const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
    });
    tokens = await r.json();
  } catch {
    return res.redirect(302, `/smart-calendar.html?auth=error&provider=outlook&reason=token_exchange`);
  }

  if (tokens.error) {
    return res.redirect(302,
      `/smart-calendar.html?auth=error&provider=outlook&reason=${encodeURIComponent(tokens.error)}`
    );
  }

  let profile;
  try {
    const r = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    profile = await r.json();
  } catch {
    return res.redirect(302, `/smart-calendar.html?auth=error&provider=outlook&reason=profile_fetch`);
  }

  const sessionId = randomUUID();
  const email     = profile.mail || profile.userPrincipalName || '';
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  await supabaseUpsert({
    session_id:    sessionId,
    email,
    name:          profile.displayName || email,
    provider:      'outlook',
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at:    expiresAt,
    updated_at:    new Date().toISOString(),
  });

  res.setHeader('Set-Cookie',
    `meridian_session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 86400}; Path=/`
  );

  return res.redirect(302,
    `/smart-calendar.html?auth=success&provider=outlook&email=${encodeURIComponent(email)}`
  );
}
