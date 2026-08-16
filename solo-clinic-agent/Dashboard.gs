/**
 * Dashboard.gs — serves the staff-facing web app (Deployment #2 in
 * SETUP.md: restricted to authorized staff Google accounts, NOT public).
 * doGet never runs for Deployment #1 (Twilio's webhook only ever POSTs).
 */

function doGet(e) {
  var email = Session.getActiveUser().getEmail();
  if (!email) {
    return HtmlService.createHtmlOutput(
      'Access denied. This dashboard requires you to be signed in to an authorized Google account.'
    );
  }
  var template = HtmlService.createTemplateFromFile('Dashboard');
  template.businessName = CONFIG.BUSINESS_NAME;
  return template.evaluate()
    .setTitle(CONFIG.BUSINESS_NAME + ' — Patient Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Called by Dashboard.html via google.script.run. Returns plain data only —
 * no secrets ever cross into the client-side HTML/JS, and no clinical data
 * is ever in these fields by design (see Config.gs's clinical-data boundary
 * note) — only what staff need to see: name, phone, logistics fields,
 * status, and any AI-drafted logistics reply awaiting approval.
 */
function getDashboardData() {
  var sheet = getSheet_();
  var c = CONFIG.COLUMNS;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { rows: [], metrics: emptyMetrics_() };

  var values = sheet.getRange(2, 1, lastRow - 1, c.CLIENT_ID).getValues();
  var rows = [];
  var responseTimes = [];
  var statusCounts = {};

  values.forEach(function (v, i) {
    var status = v[c.STATUS - 1];
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    var rt = v[c.RESPONSE_TIME_SECONDS - 1];
    if (rt) responseTimes.push(rt);

    rows.push({
      row: i + 2,
      name: v[c.NAME - 1],
      phone: maskPhone_(v[c.PHONE - 1]),
      reasonForVisit: v[c.REASON_FOR_VISIT - 1],
      preferredWindow: v[c.PREFERRED_APPOINTMENT_WINDOW - 1],
      status: status,
      lastContactAt: formatDate_(v[c.LAST_CONTACT_AT - 1]),
      nextActionAt: formatDate_(v[c.NEXT_ACTION_AT - 1]),
      responseTimeSeconds: rt,
      aiDraftReply: v[c.AI_DRAFT_REPLY - 1],
      conversationLog: v[c.CONVERSATION_LOG - 1]
    });
  });

  // Escalated / needs-staff rows and pending drafts float to the top.
  rows.sort(function (a, b) {
    var aPriority = a.aiDraftReply ? 2 : (a.status === 'escalated' ? 3 : 1);
    var bPriority = b.aiDraftReply ? 2 : (b.status === 'escalated' ? 3 : 1);
    if (aPriority !== bPriority) return bPriority - aPriority;
    return b.row - a.row;
  });

  return {
    rows: rows,
    metrics: {
      total: values.length,
      statusCounts: statusCounts,
      avgResponseTimeSeconds: responseTimes.length
        ? Math.round(responseTimes.reduce(function (a, b) { return a + b; }, 0) / responseTimes.length)
        : null
    }
  };
}

function emptyMetrics_() {
  return { total: 0, statusCounts: {}, avgResponseTimeSeconds: null };
}

function formatDate_(value) {
  if (!value) return '';
  try {
    return Utilities.formatDate(new Date(value), CONFIG.TIMEZONE, 'MM/dd HH:mm');
  } catch (e) {
    return '';
  }
}
