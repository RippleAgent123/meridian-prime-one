// api/auth/outlook-mail.js — Initiate Outlook OAuth for Mail + Calendar
import { randomBytes } from 'crypto';

export default function handler(req, res) {
  const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
  const TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
  const APP_URL   = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  if (!CLIENT_ID) {
    return res.status(503).json({ error: 'MICROSOFT_CLIENT_ID not configured in Vercel env vars' });
  }

  const state = randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie',
    `meridian_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  `${APP_URL}/api/auth/outlook-mail-callback`,
    response_type: 'code',
    scope:         'openid profile email offline_access Mail.Read Mail.ReadWrite Calendars.ReadWrite',
    state,
  });

  return res.redirect(302,
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`
  );
}
