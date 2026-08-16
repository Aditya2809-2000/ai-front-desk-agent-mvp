/**
 * ClaudeAgent.gs — drafts a reply to an inbound lead message. Never sends
 * anything itself; callers write the draft to the Sheet for owner approval.
 */

var ESCALATE_TOKEN = 'ESCALATE';

/**
 * @param {string} conversationSoFar - the running conversation log for this lead
 * @param {string} inboundMessage - the newest message from the lead
 * @return {{escalate: boolean, draft: string}}
 */
function draftReply_(conversationSoFar, inboundMessage) {
  var apiKey = getSecret_('CLAUDE_API_KEY');

  var userContent = 'Conversation so far:\n' + (conversationSoFar || '(none)') +
    '\n\nNew message from the lead:\n' + inboundMessage;

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
    return { escalate: true, draft: '' };
  }

  var body = JSON.parse(response.getContentText());
  var text = (body.content && body.content[0] && body.content[0].text || '').trim();

  if (text === ESCALATE_TOKEN) {
    return { escalate: true, draft: '' };
  }
  return { escalate: false, draft: text };
}
