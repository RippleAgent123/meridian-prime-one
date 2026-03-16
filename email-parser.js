// Meridian — Email Thread Parser
// Deploy to: /api/parse-email.js (Vercel serverless function)
// Input:  { thread: "<raw email thread text>" }
// Output: clean JSON with offer status, inspection, closing date, outstanding items, next action

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();  // uses ANTHROPIC_API_KEY env var

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a real estate transaction analyst. You extract structured data from raw email threads between agents, buyers, sellers, lenders, and title companies.

Extract only what is explicitly stated or strongly implied in the thread. Do not fabricate details. If a field is unknown, use null.

Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

// ── User prompt template ─────────────────────────────────────────────────────

function buildUserPrompt(thread) {
  return `Parse this real estate email thread and return a JSON object with exactly this structure:

{
  "property_address": string | null,
  "parties": {
    "buyer_agent": string | null,
    "listing_agent": string | null,
    "buyer": string | null,
    "seller": string | null,
    "lender": string | null,
    "title_company": string | null
  },
  "offer_status": {
    "status": "pending" | "accepted" | "countered" | "rejected" | "expired" | null,
    "offer_price": number | null,
    "counter_price": number | null,
    "expiration": string | null
  },
  "inspection": {
    "scheduled": boolean | null,
    "completed": boolean | null,
    "items": string[]
  },
  "closing": {
    "date": string | null,
    "confirmed": boolean | null,
    "blockers": string[]
  },
  "outstanding_items": string[],
  "next_action": string | null,
  "urgency": "low" | "medium" | "high" | null,
  "parsed_at": "${new Date().toISOString()}"
}

EMAIL THREAD:
${thread}`;
}

// ── Main parser function ──────────────────────────────────────────────────────

export async function parseEmailThread(thread) {
  if (!thread || typeof thread !== 'string' || !thread.trim()) {
    throw new Error('thread must be a non-empty string');
  }

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role:    'user',
        content: buildUserPrompt(thread),
      }
    ],
    system: SYSTEM_PROMPT,
  });

  const raw = message.content[0]?.text?.trim();
  if (!raw) throw new Error('Empty response from model');

  // Parse and validate
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Model returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    ...parsed,
    _meta: {
      model:        message.model,
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
  };
}

// ── Vercel serverless handler ─────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { thread } = req.body || {};

  if (!thread) {
    return res.status(400).json({ error: 'Missing required field: thread' });
  }

  try {
    const result = await parseEmailThread(thread);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Email parser error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── Usage example ─────────────────────────────────────────────────────────────
//
// const { parseEmailThread } = require('./email-parser.js');
//
// const thread = `
//   From: Sarah Mills <sarah@compass.com>
//   To: Mike Torres <mike@remax.com>
//   Subject: Re: 8812 Oak Ave — Counter Offer
//
//   Mike, seller is countering at $495k. Counter expires Friday at 5pm.
//   Inspection period would be 7 days from acceptance.
//   Target close March 21st if we can agree terms today.
//   —Sarah
// `;
//
// const parsed = await parseEmailThread(thread);
// console.log(parsed);
// => {
//   property_address: "8812 Oak Ave",
//   offer_status: { status: "countered", counter_price: 495000, expiration: "Friday at 5pm" },
//   closing: { date: "March 21st", confirmed: false, blockers: [] },
//   inspection: { scheduled: false, completed: false, items: [] },
//   outstanding_items: ["Buyer response to counter required before Friday 5pm"],
//   next_action: "Respond to seller counter before Friday 5pm deadline",
//   urgency: "high",
//   ...
// }
