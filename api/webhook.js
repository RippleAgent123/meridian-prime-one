// Meridian — Stripe Webhook Handler
// Deploy to: /api/webhook.js (Vercel serverless function)
// Listens for: checkout.session.completed, customer.subscription.created

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Tier map: Stripe Price ID → Meridian tier name
const TIER_MAP = {
  [process.env.STRIPE_PRICE_CORE]: 'core',
  [process.env.STRIPE_PRICE_PRO]:  'pro',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify signature — req.body must be raw Buffer (see vercel.json below)
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // Only handle payment success events
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data.object;

  try {
    const agentAccess = await handlePaymentSuccess(session);
    console.log('Agent record created:', JSON.stringify(agentAccess));
    return res.status(200).json({ received: true, agent: agentAccess });
  } catch (err) {
    console.error('Error processing payment:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Core handler ──────────────────────────────────────────────────────────────

async function handlePaymentSuccess(session) {
  // Resolve tier from line items (requires Stripe expand or metadata)
  const priceId = session.metadata?.price_id || null;
  const tier = TIER_MAP[priceId] || 'core';

  const agentAccess = buildAgentAccessObject({
    stripeCustomerId: session.customer,
    stripeSessionId:  session.id,
    email:            session.customer_details?.email,
    name:             session.customer_details?.name,
    tier,
  });

  // Persist — swap this call for your DB write (Supabase, PlanetScale, etc.)
  await persistAgentRecord(agentAccess);

  return agentAccess;
}

// ── Build the agent access object ─────────────────────────────────────────────

function buildAgentAccessObject({ stripeCustomerId, stripeSessionId, email, name, tier }) {
  const now = new Date().toISOString();

  return {
    schema_version: '1.0',
    created_at: now,
    agent: {
      name:  name  || null,
      email: email || null,
    },
    stripe: {
      customer_id: stripeCustomerId,
      session_id:  stripeSessionId,
    },
    access: {
      tier,                        // 'core' | 'pro'
      trial: false,                // payment confirmed — trial ended
      access_start: now,
      features: resolveFeatures(tier),
    },
  };
}

// ── Feature flags by tier ─────────────────────────────────────────────────────

function resolveFeatures(tier) {
  const base = {
    content_generator: { enabled: true,  monthly_limit: 15 },
    market_pulse:      { enabled: true,  history_months: 1  },
    email_intelligence:{ enabled: false                     },
    transaction_history:{ enabled: true, days_back: 45      },
    compliance_checker:{ enabled: true                      },
    email_parser:      { enabled: false                     },
  };

  if (tier === 'pro') {
    base.content_generator.monthly_limit     = null;   // unlimited
    base.market_pulse.history_months         = null;   // unlimited
    base.email_intelligence.enabled          = true;
    base.transaction_history.days_back       = null;   // unlimited
    base.email_parser.enabled                = true;
  }

  return base;
}

// ── Persistence stub (replace with your DB layer) ────────────────────────────

async function persistAgentRecord(agentAccess) {
  // Example: Supabase
  // const { error } = await supabase.from('agents').insert(agentAccess);
  // if (error) throw error;

  // Example: KV store (Vercel KV / Upstash)
  // await kv.set(`agent:${agentAccess.stripe.customer_id}`, agentAccess);

  // For now: log the record (replace before production)
  console.log('PERSIST_AGENT_RECORD:', JSON.stringify(agentAccess, null, 2));
}

// ── vercel.json note ──────────────────────────────────────────────────────────
// Add this to vercel.json to receive raw body for signature verification:
//
// {
//   "functions": {
//     "api/webhook.js": {
//       "bodyParser": false
//     }
//   }
// }
