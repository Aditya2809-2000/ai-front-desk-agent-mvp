/**
 * Twilio.gs — outbound send, inbound signature verification.
 * Credentials come only from Script Properties, never from the Sheet.
 */

function sendSms_(toPhone, body) {
  var accountSid = getSecret_('TWILIO_ACCOUNT_SID');
  var authToken = getSecret_('TWILIO_AUTH_TOKEN');
  var fromNumber = getSecret_('TWILIO_FROM_NUMBER');

  var url = 'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json';
  var payload = {
    To: toPhone,
    From: fromNumber,
    Body: body
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: payload,
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(accountSid + ':' + authToken)
    },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code >= 300) {
    Logger.log('Twilio send failed (%s) for %s: %s', code, maskPhone_(toPhone), response.getContentText());
    throw new Error('Twilio send failed with status ' + code);
  }
  return JSON.parse(response.getContentText());
}

/**
 * Apps Script's doPost(e) does not expose HTTP request headers, so Twilio's
 * standard X-Twilio-Signature header check (which needs the header value)
 * is not implementable here — this is a documented Apps Script limitation,
 * not an oversight. Instead we use a shared-secret query token: the Twilio
 * webhook URL is configured (SETUP.md step 6) as
 *   https://script.google.com/.../exec?token=<WEBHOOK_TOKEN>
 * and every inbound POST is rejected unless it carries a matching token.
 * This is a weaker guarantee than HMAC signature verification (a leaked
 * token can be replayed by anyone until rotated) but is the practical
 * ceiling inside Apps Script. Rotate WEBHOOK_TOKEN if you suspect it leaked.
 */
function verifyTwilioRequest_(e) {
  var expected = getSecret_('WEBHOOK_TOKEN');
  var provided = e.parameter && e.parameter.token;
  return !!provided && provided === expected;
}
