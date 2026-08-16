/**
 * Reminders.gs — the cron replacement. Install a time-driven trigger
 * (SETUP.md step 5) calling runScheduledFollowUps every 15-30 minutes.
 * Apps Script can't reliably schedule a one-off trigger per row at scale
 * (per-project trigger quota is 20), so instead one recurring trigger
 * sweeps the whole sheet for rows whose NextActionAt has come due.
 */

function runScheduledFollowUps() {
  var sheet = getSheet_();
  var c = CONFIG.COLUMNS;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var range = sheet.getRange(2, 1, lastRow - 1, c.CLIENT_ID);
  var values = range.getValues();
  var now = new Date();

  for (var i = 0; i < values.length; i++) {
    var row = i + 2;
    var status = values[i][c.STATUS - 1];
    var nextActionAt = values[i][c.NEXT_ACTION_AT - 1];
    var phone = values[i][c.PHONE - 1];
    var name = values[i][c.NAME - 1];

    if (CONFIG.TERMINAL_STATUSES.indexOf(status) !== -1) continue;
    if (!nextActionAt || new Date(nextActionAt) > now) continue;

    var reminderNumber = countReminders_(sheet, row);
    var offsets = CONFIG.REMINDER_OFFSETS_HOURS;

    if (reminderNumber >= offsets.length) {
      // Reminder sequence exhausted with no reply — stop nudging, leave for a human.
      sheet.getRange(row, c.STATUS).setValue('escalated');
      appendConversationLog_(sheet, row, 'SYSTEM', 'Reminder sequence exhausted, no reply.');
      continue;
    }

    var message = buildReminderMessage_(name, reminderNumber);
    try {
      sendSms_(phone, message);
      sheet.getRange(row, c.STATUS).setValue('reminder_sent');
      sheet.getRange(row, c.LAST_CONTACT_AT).setValue(now);
      var nextOffset = offsets[reminderNumber + 1];
      sheet.getRange(row, c.NEXT_ACTION_AT).setValue(
        nextOffset ? addHours_(now, nextOffset - offsets[reminderNumber]) : ''
      );
      appendConversationLog_(sheet, row, 'AGENT (reminder)', message);
    } catch (err) {
      Logger.log('Reminder send failed for row %s: %s', row, err.message);
    }
  }
}

function countReminders_(sheet, row) {
  var c = CONFIG.COLUMNS;
  var log = sheet.getRange(row, c.CONVERSATION_LOG).getValue() || '';
  var matches = log.match(/AGENT \(reminder\)/g);
  return matches ? matches.length : 0;
}

function buildReminderMessage_(name, reminderNumber) {
  var firstName = String(name || '').split(' ')[0] || 'there';
  if (reminderNumber === 0) {
    return 'Hi ' + firstName + ', just following up on your interest with ' +
      CONFIG.BUSINESS_NAME + ' — still happy to help, reply anytime with questions ' +
      'or to set up a time to talk.';
  }
  return 'Hi ' + firstName + ', checking in one more time from ' + CONFIG.BUSINESS_NAME +
    '. If now is not a good time, no worries — reply STOP to opt out, or reach us anytime.';
}

/**
 * Run once manually after setup to create the recurring trigger.
 * Idempotent: clears any existing trigger for this function first.
 */
function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runScheduledFollowUps') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runScheduledFollowUps')
    .timeBased()
    .everyMinutes(15)
    .create();
}
