/**
 * Config.gs — all client-specific values live here or in Script Properties.
 * Nothing in this file is a secret. Secrets (Twilio SID/token, Claude API key,
 * escalation number) come from PropertiesService, set once in the Apps Script
 * editor under Project Settings > Script Properties, or via SETUP.md's
 * setScriptProperties_() helper. They are never written to the Sheet.
 */

var CONFIG = {
  CLIENT_ID: 'test-client-01',            // unique per client deployment
  BUSINESS_NAME: 'Riverside Realty',      // shown in outbound message signatures
  SHEET_NAME: 'Leads',
  TIMEZONE: 'America/New_York',

  // Column layout of the "Leads" sheet, 1-indexed to match Sheets API.
  // Columns A-F are written natively by the linked Google Form.
  // Columns G-M are written/maintained by this script.
  COLUMNS: {
    TIMESTAMP: 1,
    NAME: 2,
    PHONE: 3,
    PROPERTY_INTEREST: 4,
    BUDGET_RANGE: 5,
    PREFERRED_CONTACT_TIME: 6,
    STATUS: 7,                // pending | contacted | replied | reminder_sent | escalated | booked | closed
    LAST_CONTACT_AT: 8,
    NEXT_ACTION_AT: 9,
    RESPONSE_TIME_SECONDS: 10,
    AI_DRAFT_REPLY: 11,
    CONVERSATION_LOG: 12,
    APPROVED: 13,              // checkbox, owner-controlled
    CLIENT_ID: 14
  },

  // Reminder sequence, in hours after first contact, only fires while
  // Status is still 'contacted' or 'reminder_sent' (i.e. no reply/booking yet).
  REMINDER_OFFSETS_HOURS: [24, 72],

  // How the scheduled sweep decides a row is "done" and stops nudging it.
  TERMINAL_STATUSES: ['replied', 'booked', 'closed', 'escalated'],

  CLAUDE_MODEL: 'claude-sonnet-5',
  CLAUDE_MAX_TOKENS: 400,

  SYSTEM_PROMPT: [
    'You are the SMS follow-up assistant for ' + 'Riverside Realty' + ', a real estate brokerage.',
    'Scope: answer general property questions (listing details the lead already referenced,',
    'neighborhood/general area info, viewing logistics, next steps in the buying/renting process)',
    'and help coordinate appointment scheduling. Keep replies under 320 characters, friendly,',
    'concrete, and never invent listing details, prices, or availability you were not given.',
    '',
    'Hard escalate — reply ONLY with the exact token ESCALATE and nothing else — if the message:',
    '- discusses financing/mortgage pre-approval specifics, legal terms, or contract negotiation',
    '- disputes something (price, fees, an agent, the brokerage)',
    '- is abusive, or the lead explicitly asks for a human',
    '- you are not confident you can answer correctly from the conversation context alone',
    '',
    'You never send messages directly. You are drafting a reply for the human broker to review',
    'and approve before it goes out.'
  ].join('\n')
};

function getSecret_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error('Missing required script property: ' + key + '. See SETUP.md step 4.');
  }
  return value;
}

function maskPhone_(phone) {
  if (!phone) return '(none)';
  var digits = String(phone).replace(/\D/g, '');
  return 'xxx-xxx-' + digits.slice(-4);
}
