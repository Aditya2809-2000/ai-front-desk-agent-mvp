/**
 * Code.gs — form-submit orchestration, inbound webhook, approval-send.
 */

function getSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
}

/**
 * Installable trigger target: Edit > Current project's triggers >
 * Add trigger > handleNewLead > From spreadsheet > On form submit.
 * (See SETUP.md step 5 — must be an installable trigger, not the simple
 * onFormSubmit, so it has permission to call UrlFetchApp.)
 */
function handleNewLead(e) {
  var sheet = getSheet_();
  var row = e.range.getRow();
  var c = CONFIG.COLUMNS;

  var name = sheet.getRange(row, c.NAME).getValue();
  var phone = normalizePhone_(sheet.getRange(row, c.PHONE).getValue());
  var propertyInterest = sheet.getRange(row, c.PROPERTY_INTEREST).getValue();
  var submittedAt = sheet.getRange(row, c.TIMESTAMP).getValue();

  sheet.getRange(row, c.PHONE).setValue(phone);
  sheet.getRange(row, c.CLIENT_ID).setValue(CONFIG.CLIENT_ID);
  sheet.getRange(row, c.STATUS).setValue('processing');

  var message = buildFirstContactMessage_(name, propertyInterest);

  try {
    sendSms_(phone, message);
    var now = new Date();
    sheet.getRange(row, c.STATUS).setValue('contacted');
    sheet.getRange(row, c.LAST_CONTACT_AT).setValue(now);
    sheet.getRange(row, c.NEXT_ACTION_AT).setValue(addHours_(now, CONFIG.REMINDER_OFFSETS_HOURS[0]));
    sheet.getRange(row, c.RESPONSE_TIME_SECONDS).setValue(
      Math.round((now.getTime() - new Date(submittedAt).getTime()) / 1000)
    );
    appendConversationLog_(sheet, row, 'AGENT (auto)', message);
    Logger.log('First contact sent to %s', maskPhone_(phone));
  } catch (err) {
    sheet.getRange(row, c.STATUS).setValue('escalated');
    appendConversationLog_(sheet, row, 'SYSTEM', 'First-contact send failed: ' + err.message);
    Logger.log('First contact FAILED for %s: %s', maskPhone_(phone), err.message);
  }
}

function buildFirstContactMessage_(name, propertyInterest) {
  var firstName = String(name || '').split(' ')[0] || 'there';
  return 'Hi ' + firstName + ', thanks for reaching out to ' + CONFIG.BUSINESS_NAME +
    ' about ' + (propertyInterest || 'your property search') + '! ' +
    'A member of our team will follow up shortly. Reply here anytime with questions ' +
    'or to share your availability for a viewing.';
}

/**
 * Deployed as the PUBLIC web app (Deployment #1 in SETUP.md). Twilio posts
 * inbound SMS/WhatsApp replies here. Requires a valid ?token= — see
 * Twilio.gs verifyTwilioRequest_ for why a token is used instead of the
 * standard signature header.
 */
function doPost(e) {
  if (!verifyTwilioRequest_(e)) {
    return ContentService.createTextOutput('Forbidden').setMimeType(ContentService.MimeType.TEXT);
  }

  var fromPhone = normalizePhone_(e.parameter.From);
  var bodyText = e.parameter.Body || '';

  var sheet = getSheet_();
  var row = findRowByPhone_(sheet, fromPhone);
  if (!row) {
    Logger.log('Inbound message from unknown number %s — ignored', maskPhone_(fromPhone));
    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  }

  var c = CONFIG.COLUMNS;
  appendConversationLog_(sheet, row, 'LEAD', bodyText);

  var conversationSoFar = sheet.getRange(row, c.CONVERSATION_LOG).getValue();
  var result = draftReply_(conversationSoFar, bodyText);

  if (result.escalate) {
    sheet.getRange(row, c.STATUS).setValue('escalated');
    sheet.getRange(row, c.AI_DRAFT_REPLY).setValue('');
    notifyEscalation_(fromPhone, bodyText);
  } else {
    sheet.getRange(row, c.STATUS).setValue('replied');
    sheet.getRange(row, c.AI_DRAFT_REPLY).setValue(result.draft);
    sheet.getRange(row, c.APPROVED).setValue(false);
  }
  sheet.getRange(row, c.LAST_CONTACT_AT).setValue(new Date());

  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function notifyEscalation_(leadPhone, message) {
  var escalationNumber = PropertiesService.getScriptProperties().getProperty('ESCALATION_PHONE_NUMBER');
  if (!escalationNumber) return;
  try {
    sendSms_(escalationNumber,
      CONFIG.BUSINESS_NAME + ' AI agent needs you: lead ' + maskPhone_(leadPhone) +
      ' sent a message that needs a human reply. Check the dashboard.');
  } catch (err) {
    Logger.log('Escalation notify failed: %s', err.message);
  }
}

/**
 * Called from the dashboard (Dashboard.html, via google.script.run) when the
 * owner clicks Approve on a drafted reply. This is the ONLY code path that
 * sends an AI-drafted message to a lead.
 */
function sendApprovedReply(row) {
  var sheet = getSheet_();
  var c = CONFIG.COLUMNS;
  var phone = sheet.getRange(row, c.PHONE).getValue();
  var draft = sheet.getRange(row, c.AI_DRAFT_REPLY).getValue();

  if (!draft) throw new Error('No draft reply on row ' + row);

  sendSms_(phone, draft);
  sheet.getRange(row, c.APPROVED).setValue(true);
  sheet.getRange(row, c.STATUS).setValue('contacted');
  sheet.getRange(row, c.LAST_CONTACT_AT).setValue(new Date());
  sheet.getRange(row, c.AI_DRAFT_REPLY).setValue('');
  appendConversationLog_(sheet, row, 'AGENT (approved)', draft);
  return { ok: true };
}

function findRowByPhone_(sheet, phone) {
  var c = CONFIG.COLUMNS;
  var values = sheet.getRange(2, c.PHONE, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizePhone_(values[i][0]) === phone) return i + 2;
  }
  return null;
}

function appendConversationLog_(sheet, row, speaker, text) {
  var c = CONFIG.COLUMNS;
  var cell = sheet.getRange(row, c.CONVERSATION_LOG);
  var existing = cell.getValue();
  var stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'MM/dd HH:mm');
  var line = '[' + stamp + '] ' + speaker + ': ' + text;
  cell.setValue(existing ? existing + '\n' + line : line);
}

function normalizePhone_(phone) {
  var digits = String(phone || '').replace(/[^\d+]/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  if (digits[0] === '+') return digits;
  return digits;
}

function addHours_(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
