// api/auth/gmail.js — Initiate Gmail OAuth
// Scopes: gmail.readonly, gmail.modify, gmail.labels + calendar.events
import { randomBytes } from 'crypto';

export default function handler(req, res) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const APP_URL   = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  if (!CLIENT_ID) {
    return res.status(503).json({ error: 'GOOGLE_CLIENT_ID not configured in Vercel env vars' });
  }

  const state = randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie',
    `meridian_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  `${APP_URL}/api/auth/gmail-callback`,
    response_type: 'code',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.labels',
      'https://www.googleapis.com/auth/calendar.events',
    ].join(' '),
    access_type: 'offline',
    prompt:      'consent',
    state,
  });

  return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
