// api/auth/gmail-callback.js — Gmail OAuth callback
// Exchanges auth code → stores tokens in Supabase → sets session cookie → redirects to smart-calendar
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseUpsert(data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return; // graceful no-op if not configured
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
  const CLIENT_ID    = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET= process.env.GOOGLE_CLIENT_SECRET;
  const APP_URL      = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';
  const REDIRECT_URI = `${APP_URL}/api/auth/gmail-callback`;

  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(302,
      `/smart-calendar.html?auth=error&provider=gmail&reason=${encodeURIComponent(error || 'no_code')}`
    );
  }

  // Exchange code for tokens
  let tokens;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
    });
    tokens = await r.json();
  } catch {
    return res.redirect(302, `/smart-calendar.html?auth=error&provider=gmail&reason=token_exchange`);
  }

  if (tokens.error) {
    return res.redirect(302,
      `/smart-calendar.html?auth=error&provider=gmail&reason=${encodeURIComponent(tokens.error)}`
    );
  }

  // Get profile
  let profile;
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    profile = await r.json();
  } catch {
    return res.redirect(302, `/smart-calendar.html?auth=error&provider=gmail&reason=profile_fetch`);
  }

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  // Store in Supabase — table: agent_connections (session_id, email, name, provider, access_token, refresh_token, expires_at)
  await supabaseUpsert({
    session_id:    sessionId,
    email:         profile.email,
    name:          profile.name || profile.email,
    provider:      'gmail',
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at:    expiresAt,
    updated_at:    new Date().toISOString(),
  });

  // Session cookie — contains only the session UUID, not the token
  res.setHeader('Set-Cookie',
    `meridian_session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 86400}; Path=/`
  );

  return res.redirect(302,
    `/smart-calendar.html?auth=success&provider=gmail&email=${encodeURIComponent(profile.email)}`
  );
}
