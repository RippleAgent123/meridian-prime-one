// Meridian — Bad Data Filter
// Runs before any data saves to agent profile, transaction file, or lead record.
// Usage: import { validate } from './bad-data-filter.js'
// Returns: { valid: boolean, errors: string[], warnings: string[], cleaned: object }

// ── Field validators ──────────────────────────────────────────────────────────

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
function isPositiveNumber(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
function isValidDate(v)      { if (!v) return false; const d = new Date(v); return !isNaN(d.getTime()); }
function isValidEmail(v)     { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
function isValidPhone(v)     { return typeof v === 'string' && v.replace(/\D/g,'').length >= 10; }
function isValidZip(v)       { return typeof v === 'string' && /^\d{5}(-\d{4})?$/.test(v.trim()); }

// ── Schema validators ─────────────────────────────────────────────────────────

/**
 * Validate an agent profile object (from meridian-onboarding.html).
 */
function validateAgentProfile(data) {
  const errors = [];
  const warnings = [];
  const cleaned = JSON.parse(JSON.stringify(data));

  // Required fields
  if (!isNonEmptyString(data?.agent?.name))      errors.push('agent.name is required');
  if (!isNonEmptyString(data?.agent?.brokerage)) errors.push('agent.brokerage is required');

  // Market focus
  if (!Array.isArray(data?.market_focus) || data.market_focus.length === 0) {
    errors.push('market_focus must be a non-empty array');
  }

  // Price range
  const min = data?.average_price_range?.min;
  const max = data?.average_price_range?.max;
  if (min !== null && !isPositiveNumber(min)) errors.push('average_price_range.min must be a positive number');
  if (max !== null && !isPositiveNumber(max)) errors.push('average_price_range.max must be a positive number');
  if (min && max && min >= max) errors.push('average_price_range.min must be less than max');

  // Client type
  if (!['buyers','sellers','both'].includes(data?.client_type)) {
    errors.push('client_type must be one of: buyers, sellers, both');
  }

  // Communication style
  if (!['formal','casual','direct'].includes(data?.communication_style)) {
    errors.push('communication_style must be one of: formal, casual, direct');
  }

  // Goals
  if (!Array.isArray(data?.goals) || data.goals.length < 1) {
    errors.push('goals must be a non-empty array');
  } else {
    const emptyGoals = data.goals.filter(g => !isNonEmptyString(g));
    if (emptyGoals.length > 0) errors.push(`goals contains ${emptyGoals.length} empty entry(ies)`);
    if (new Set(data.goals).size < data.goals.length) warnings.push('goals contains duplicate entries');
    // Clean: deduplicate
    cleaned.goals = [...new Set(data.goals.filter(g => isNonEmptyString(g)))];
  }

  return { valid: errors.length === 0, errors, warnings, cleaned };
}

/**
 * Validate a lead/client profile object (from lead-intake.html).
 */
function validateLeadProfile(data) {
  const errors = [];
  const warnings = [];
  const cleaned = JSON.parse(JSON.stringify(data));

  // Client name
  if (!isNonEmptyString(data?.client?.first_name)) errors.push('client.first_name is required');
  if (!isNonEmptyString(data?.client?.last_name))  errors.push('client.last_name is required');

  // Contact info — at least one required
  const hasEmail = data?.client?.email && isValidEmail(data.client.email);
  const hasPhone = data?.client?.phone && isValidPhone(data.client.phone);
  if (!hasEmail && !hasPhone) errors.push('At least one of client.email or client.phone is required');
  if (data?.client?.email && !hasEmail) errors.push(`client.email "${data.client.email}" is not a valid email address`);

  // Budget
  const budgetMin = data?.search?.budget?.min;
  const budgetMax = data?.search?.budget?.max;
  if (budgetMin && !isPositiveNumber(budgetMin)) errors.push('search.budget.min must be a positive number');
  if (budgetMax && !isPositiveNumber(budgetMax)) errors.push('search.budget.max must be a positive number');
  if (budgetMin && budgetMax && budgetMin >= budgetMax) errors.push('search.budget.min must be less than max');

  // Areas
  if (!Array.isArray(data?.search?.areas) || data.search.areas.length === 0) {
    warnings.push('search.areas is empty — lead may be too vague for targeted outreach');
  }

  // Timeline
  const validTimelines = ['asap','1_3mo','3_6mo','6_12mo','exploring'];
  if (data?.search?.timeline && !validTimelines.includes(data.search.timeline)) {
    errors.push(`search.timeline "${data.search.timeline}" is not a valid value`);
  }

  // Duplicate check (by email)
  // In production, pass existingLeads array to check for duplicates
  // cleaned: normalize email to lowercase
  if (cleaned?.client?.email) cleaned.client.email = cleaned.client.email.toLowerCase().trim();

  return { valid: errors.length === 0, errors, warnings, cleaned };
}

/**
 * Validate a transaction object.
 */
function validateTransaction(data) {
  const errors = [];
  const warnings = [];
  const cleaned = JSON.parse(JSON.stringify(data));

  if (!isNonEmptyString(data?.address)) errors.push('address is required');

  // Dates
  if (data?.closing_date && data.closing_date !== 'TBD' && !isValidDate(data.closing_date)) {
    errors.push(`closing_date "${data.closing_date}" is not a valid date`);
  }

  if (data?.closing_date && data?.contract_date) {
    const closing = new Date(data.closing_date);
    const contract = new Date(data.contract_date);
    if (isValidDate(data.closing_date) && isValidDate(data.contract_date) && closing <= contract) {
      errors.push('closing_date must be after contract_date');
    }
  }

  // Price
  if (data?.purchase_price && !isPositiveNumber(Number(String(data.purchase_price).replace(/[$,]/g,'')))) {
    errors.push('purchase_price must be a positive number');
  }

  // Stage
  const validStages = ['listed','offer','pending','closing','closed','cancelled'];
  if (data?.stage && !validStages.includes(data.stage)) {
    errors.push(`stage "${data.stage}" is not valid. Must be one of: ${validStages.join(', ')}`);
  }

  // Conflicting information check
  if (data?.stage === 'listed' && data?.closing_date && data.closing_date !== 'TBD') {
    warnings.push('Transaction is in "listed" stage but has a closing_date — verify this is intentional');
  }

  return { valid: errors.length === 0, errors, warnings, cleaned };
}

/**
 * Validate an email parser result object.
 */
function validateEmailParserResult(data) {
  const errors = [];
  const warnings = [];

  if (!data?.schema_version) warnings.push('Missing schema_version — may be from an older parser version');

  // Dates in email parse output
  const dateFields = ['offer_status.expiration','closing.date'];
  dateFields.forEach(path => {
    const parts = path.split('.');
    const val = parts.reduce((obj, k) => obj?.[k], data);
    if (val && val !== 'TBD' && val !== null && !isValidDate(val)) {
      warnings.push(`${path} "${val}" could not be parsed as a date — verify manually`);
    }
  });

  // Price sanity
  const offerPrice = data?.offer_status?.offer_price;
  const counterPrice = data?.offer_status?.counter_price;
  if (offerPrice && !isPositiveNumber(offerPrice)) errors.push('offer_status.offer_price must be positive');
  if (counterPrice && !isPositiveNumber(counterPrice)) errors.push('offer_status.counter_price must be positive');

  return { valid: errors.length === 0, errors, warnings, cleaned: data };
}

// ── Master validate function ──────────────────────────────────────────────────

/**
 * Validate any Meridian data object based on its schema_type.
 *
 * @param {'agent_profile'|'lead'|'transaction'|'email_parse'} schemaType
 * @param {object} data — the data to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[], cleaned: object }}
 */
export function validate(schemaType, data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Input must be a non-null object'], warnings: [], cleaned: data };
  }

  switch (schemaType) {
    case 'agent_profile': return validateAgentProfile(data);
    case 'lead':          return validateLeadProfile(data);
    case 'transaction':   return validateTransaction(data);
    case 'email_parse':   return validateEmailParserResult(data);
    default:
      return { valid: false, errors: [`Unknown schema type: "${schemaType}"`], warnings: [], cleaned: data };
  }
}

// ── Usage examples ────────────────────────────────────────────────────────────
//
// import { validate } from './bad-data-filter.js';
//
// // Before saving an agent profile:
// const result = validate('agent_profile', profileData);
// if (!result.valid) {
//   showErrorsToUser(result.errors);   // surface in UI
//   return;
// }
// if (result.warnings.length) console.warn('Profile warnings:', result.warnings);
// saveToStorage(result.cleaned);       // always save the cleaned version
//
// // Before saving a lead:
// const { valid, errors, cleaned } = validate('lead', leadData);
// if (!valid) throw new Error(errors.join(', '));
// await db.leads.insert(cleaned);
//
// // In a form submit handler (browser):
// const result = validate('transaction', txData);
// displayValidation(result); // show green/red per field
