// api/inbox.js — Fetch agent inbox, apply 3-layer filter, analyze with Claude Haiku
// GET /api/inbox — requires meridian_session cookie (set by gmail-callback or outlook-mail-callback)

import Anthropic from '@anthropic-ai/sdk';

const client     = new Anthropic(); // ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Helpers ────────────────────────────────────────────────────
function parseCookie(cookieStr, name) {
  if (!cookieStr) return null;
  const m = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

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

// ── Layer 1: Trusted sender whitelist ─────────────────────────
const TRUSTED_SENDERS = [
  'title', 'escrow', 'closing', 'settlement', 'realty', 'realtor',
  'mls', 'listings', 'brokerage', 'compass', 'keller', 'coldwell',
  'sotheby', 'century21', 'remax', 'berkshire', 'baird', 'exp realty',
  'chase', 'wells fargo', 'rocket', 'guaranteed rate', 'wintrust', 'lakeshore',
  'attorney', 'law office', 'legal', 'notary', 'settlement',
];
function isTrustedSender(from) {
  const lower = (from || '').toLowerCase();
  return TRUSTED_SENDERS.some(kw => lower.includes(kw));
}

// ── Layer 2: Transaction keyword detection ────────────────────
const TX_KEYWORDS = [
  'offer', 'counter', 'closing', 'inspection', 'contingency',
  'pre-approval', 'pre approval', 'earnest', 'appraisal', 'attorney review',
  'deed', 'title', 'possession', 'escrow', 'mortgage', 'commitment',
  'clear to close', 'final walkthrough', 'wire', 'hoa', 'due diligence',
  'listing', 'showing', 'accepted', 'rejected', 'expired', 'contract',
  'purchase', 'seller', 'buyer', 'lender', 'underwriting',
];
function hasTransactionKeyword(text) {
  const lower = (text || '').toLowerCase();
  return TX_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Layer 3: Spam / newsletter filter ────────────────────────
const SPAM_PATTERNS = [
  'unsubscribe', 'newsletter', 'rate sheet', 'weekly digest', 'monthly report',
  'noreply@', 'no-reply@', 'donotreply', 'marketing@', 'promotions@',
  'deal of the week', 'limited time', 'subscribe now', 'mailing list',
  'your account statement', 'invoice #', 'receipt for your',
  'password reset', 'verify your email', 'confirm your',
];
function isSpam(from, subject) {
  const text = ((from || '') + ' ' + (subject || '')).toLowerCase();
  return SPAM_PATTERNS.some(p => text.includes(p));
}

function shouldProcess(email) {
  if (isSpam(email.from, email.subject)) return false;
  if (isTrustedSender(email.from)) return true;
  return hasTransactionKeyword(email.subject + ' ' + email.snippet);
}

// ── Fetch Gmail inbox ──────────────────────────────────────────
async function fetchGmail(accessToken) {
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&labelIds=INBOX&q=-in:spam',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error('Gmail API error: ' + listRes.status);
  const list = await listRes.json();
  if (!list.messages?.length) return [];

  const messages = await Promise.all(
    list.messages.slice(0, 20).map(async ({ id }) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      return r.json();
    })
  );

  return messages.map(m => {
    const hdr = m.payload?.headers || [];
    const h   = (n) => hdr.find(x => x.name === n)?.value || '';
    return { id: m.id, from: h('From'), subject: h('Subject'), date: h('Date'), snippet: m.snippet || '' };
  });
}

// ── Fetch Outlook inbox ────────────────────────────────────────
async function fetchOutlook(accessToken) {
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$select=id,from,subject,receivedDateTime,bodyPreview',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error('Graph API error: ' + res.status);
  const data = await res.json();
  return (data.value || []).map(m => ({
    id:      m.id,
    from:    m.from?.emailAddress?.address || '',
    subject: m.subject || '',
    date:    m.receivedDateTime || '',
    snippet: m.bodyPreview || '',
  }));
}

// ── Claude Haiku analysis ──────────────────────────────────────
const TAG_MAP = { urgent: 'URGENT', deadline: 'DEADLINE', counter: 'COUNTER', action: 'ACTION', 'auto-handled': 'AUTO-HANDLED' };

async function analyzeEmail({ from, subject, snippet }) {
  const res = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `You are a real estate email analyst. Analyze this email and return ONLY valid JSON (no markdown, no explanation).

From: ${from}
Subject: ${subject}
Preview: ${snippet}

Return this exact JSON structure:
{"sender":"display name or email","subject":"subject line","urgency":"urgent|deadline|counter|action|auto-handled","transaction_match":"property address or client name or null","required_action":"one sentence describing what agent must do, or null if no action needed","tag":"URGENT|DEADLINE|COUNTER|ACTION|AUTO-HANDLED"}

Tag rules:
- URGENT: closing/counter expires <48h, wire instructions, final walkthrough
- DEADLINE: inspection deadline, attorney review end, contingency deadline
- COUNTER: counter offer received or sent
- ACTION: requires agent response but not urgent
- AUTO-HANDLED: informational only, no action required`,
    }],
  });

  const raw = res.content[0]?.text?.trim() || '';
  try {
    const parsed = JSON.parse(raw);
    parsed.tag = parsed.tag?.toUpperCase() || 'ACTION';
    return parsed;
  } catch {
    return { sender: from, subject, urgency: 'action', transaction_match: null, required_action: 'Review this email', tag: 'ACTION' };
  }
}

// ── Tag sort order ─────────────────────────────────────────────
const TAG_ORDER = { URGENT: 0, DEADLINE: 1, COUNTER: 2, ACTION: 3, 'AUTO-HANDLED': 4 };

// ── Handler ────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store, no-cache');

  const sessionId = parseCookie(req.headers.cookie, 'meridian_session');
  if (!sessionId) {
    return res.status(401).json({ error: 'Not connected. Connect Gmail or Outlook to get started.' });
  }

  let session;
  try {
    session = await getSession(sessionId);
  } catch (e) {
    return res.status(503).json({ error: 'Database unavailable: ' + e.message });
  }

  if (!session) {
    return res.status(401).json({ error: 'Session expired. Reconnect your email account.' });
  }

  // Fetch raw inbox
  let raw;
  try {
    raw = session.provider === 'gmail'
      ? await fetchGmail(session.access_token)
      : await fetchOutlook(session.access_token);
  } catch (e) {
    return res.status(502).json({ error: 'Inbox fetch failed: ' + e.message });
  }

  // Apply 3-layer filter
  const filtered = raw.filter(shouldProcess);

  if (!filtered.length) {
    return res.status(200).json({
      emails: [], provider: session.provider, agent_email: session.email,
      total_scanned: raw.length, total_filtered: 0,
      message: 'Inbox clean — no transaction emails require attention right now.',
    });
  }

  // Analyze with Claude Haiku (cap at 12 to control API costs)
  const analyzed = await Promise.all(
    filtered.slice(0, 12).map(m =>
      analyzeEmail(m).catch(() => ({
        sender: m.from, subject: m.subject, urgency: 'action',
        transaction_match: null, required_action: 'Review email', tag: 'ACTION',
      }))
    )
  );

  // Sort: urgent first
  analyzed.sort((a, b) => (TAG_ORDER[a.tag] ?? 5) - (TAG_ORDER[b.tag] ?? 5));

  return res.status(200).json({
    emails:         analyzed,
    provider:       session.provider,
    agent_email:    session.email,
    total_scanned:  raw.length,
    total_filtered: analyzed.length,
  });
}
