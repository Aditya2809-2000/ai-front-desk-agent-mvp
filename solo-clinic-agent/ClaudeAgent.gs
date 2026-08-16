/**
 * ClaudeAgent.gs — drafts a reply to an inbound patient message. Never sends
 * anything itself; callers write the draft to the Sheet for staff approval.
 *
 * CLINICAL-DATA BOUNDARY (best-effort MVP guard, not a compliance guarantee):
 * every inbound message is checked against looksClinical_() BEFORE it is
 * ever sent to the Claude API. A match skips the LLM call entirely and goes
 * straight to human escalation — the model never sees text that our local
 * filter flags as clinical. This is defense-in-depth on top of the system
 * prompt's own instruction to refuse and escalate clinical content; it does
 * NOT guarantee no clinical text ever reaches the API (the filter is a
 * keyword/pattern heuristic and will miss things), and it does not scrub
 * clinical text a patient sends from the Sheet's conversation log — staff
 * need the raw message to call the patient back. Treat this as a routing
 * safeguard, not a clinical-data elimination guarantee.
 */

var ESCALATE_TOKEN = 'ESCALATE';

var CLINICAL_KEYWORDS = [
  'pain', 'hurt', 'hurts', 'ache', 'aching', 'symptom', 'symptoms', 'fever', 'nausea',
  'vomit', 'bleeding', 'blood', 'rash', 'swelling', 'swollen', 'dizzy', 'dizziness',
  'diagnos', 'prescri', 'medicat', 'dosage', 'dose', 'refill', 'side effect', 'allerg',
  'infection', 'injury', 'injured', 'broken', 'fracture', 'chest', 'breath', 'breathing',
  'suicid', 'self harm', 'self-harm', 'depress', 'anxiety', 'panic attack',
  'test result', 'lab result', 'biopsy', 'x-ray', 'mri', 'ct scan', 'ultrasound',
  'emergency', 'urgent care', 'er ', 'hospital', 'ambulance', 'overdose', 'pregnant', 'pregnancy'
];

function looksClinical_(text) {
  var normalized = String(text || '').toLowerCase();
  return CLINICAL_KEYWORDS.some(function (kw) { return normalized.indexOf(kw) !== -1; });
}

/**
 * @param {string} conversationSoFar - the running conversation log for this patient
 * @param {string} inboundMessage - the newest message from the patient
 * @return {{escalate: boolean, draft: string, reason: string}}
 */
function draftReply_(conversationSoFar, inboundMessage) {
  if (looksClinical_(inboundMessage)) {
    return { escalate: true, draft: '', reason: 'local_keyword_filter' };
  }

  var apiKey = getSecret_('CLAUDE_API_KEY');

  var userContent = 'Conversation so far:\n' + (conversationSoFar || '(none)') +
    '\n\nNew message from the patient:\n' + inboundMessage;

  var payload = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
    system: CONFIG.SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }]
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code >= 300) {
    Logger.log('Claude API error (%s): %s', code, response.getContentText());
    // Fail safe: if the model can't be reached, escalate rather than guess.
    return { escalate: true, draft: '', reason: 'api_error' };
  }

  var body = JSON.parse(response.getContentText());
  var text = (body.content && body.content[0] && body.content[0].text || '').trim();

  if (text === ESCALATE_TOKEN) {
    return { escalate: true, draft: '', reason: 'model_escalated' };
  }
  return { escalate: false, draft: text, reason: '' };
}
