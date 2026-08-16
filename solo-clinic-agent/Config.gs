/**
 * Config.gs — all client-specific values live here or in Script Properties.
 * Nothing in this file is a secret. Secrets (Twilio SID/token, Claude API key,
 * escalation number) come from PropertiesService, set once in the Apps Script
 * editor under Project Settings > Script Properties, or via SETUP.md's
 * setScriptProperties_() helper. They are never written to the Sheet.
 *
 * CLINICAL-DATA BOUNDARY: this app is scoped to appointment logistics only.
 * "Reason for visit" is a closed set of non-clinical categories (never a
 * free-text symptom field) and the LLM system prompt below refuses anything
 * that reads as clinical. See ClaudeAgent.gs for the pre-LLM keyword filter
 * that backs this up. Read the HIPAA note in README.md before using this
 * with real patients.
 */

var CONFIG = {
  CLIENT_ID: 'test-client-01',            // unique per client deployment
  BUSINESS_NAME: 'Maple Street Family Practice', // shown in outbound message signatures
  SHEET_NAME: 'Intake',
  TIMEZONE: 'America/New_York',

  // Column layout of the "Intake" sheet, 1-indexed to match Sheets API.
  // Columns A-E are written natively by the linked Google Form.
  // Columns F-L are written/maintained by this script.
  COLUMNS: {
    TIMESTAMP: 1,
    NAME: 2,
    PHONE: 3,
    REASON_FOR_VISIT: 4,        // closed set of non-clinical categories, see Google Form
    PREFERRED_APPOINTMENT_WINDOW: 5,
    STATUS: 6,                  // pending | contacted | replied | reminder_sent | escalated | booked | closed
    LAST_CONTACT_AT: 7,
    NEXT_ACTION_AT: 8,
    RESPONSE_TIME_SECONDS: 9,
    AI_DRAFT_REPLY: 10,
    CONVERSATION_LOG: 11,
    APPROVED: 12,                // checkbox, owner-controlled
    CLIENT_ID: 13
  },

  REMINDER_OFFSETS_HOURS: [24, 72],
  TERMINAL_STATUSES: ['replied', 'booked', 'closed', 'escalated'],

  CLAUDE_MODEL: 'claude-sonnet-5',
  CLAUDE_MAX_TOKENS: 300,

  SYSTEM_PROMPT: [
    'You are the SMS front-desk assistant for ' + 'Maple Street Family Practice' + ', a clinic.',
    'Your ONLY scope is appointment logistics: confirming/rescheduling appointment times,',
    'explaining check-in/parking/what-to-bring, office hours, insurance/paperwork logistics,',
    'and general non-clinical front-desk questions. Keep replies under 300 characters.',
    '',
    'You are NEVER permitted to: give medical, diagnostic, or treatment advice or opinions;',
    'interpret symptoms; discuss medications, dosages, or side effects; comment on test',
    'results; or respond to anything a reasonable person would consider a clinical question.',
    '',
    'Hard escalate — reply ONLY with the exact token ESCALATE and nothing else — if the message',
    'contains ANY symptom, diagnosis, medication, test result, pain/injury description, mental',
    'health content, or anything else clinical in nature, or if you are not fully confident the',
    'message is pure scheduling/logistics, or the patient explicitly asks for a human/nurse/doctor.',
    'When in doubt, escalate — do not guess on anything health-related.',
    '',
    'You never send messages directly. You are drafting a reply for clinic staff to review and',
    'approve before it goes out.'
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
