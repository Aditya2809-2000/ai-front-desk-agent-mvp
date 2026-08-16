# Solo Clinic AI Agent — Setup (single test client)

## ⚠️ Read this before using with real patients

This MVP is scoped to keep clinical/diagnostic content out of the Sheet and out of the LLM
(see "Clinical-data boundary" below) — but **the moment a form field, name, or phone number is
tied to "this person is a patient at this clinic with an appointment," that combination is
Protected Health Information (PHI) under HIPAA in the US**, regardless of how non-clinical the
fields are. Handling real patient PHI with this stack requires, at minimum:

- A **HIPAA Business Associate Agreement (BAA)** with Google (available on Google
  Workspace, not personal Gmail), with Twilio (available on eligible plans), and with
  Anthropic (available for eligible customers — contact Anthropic sales) — **before** any real
  patient data flows through this system.
- Your own review of whether SMS/WhatsApp is an acceptable channel for this content under your
  state's regulations and your own compliance policy.

Until those BAAs are in place, treat this as a **build/test environment only** — use fake
patients, your own phone number, and no real PHI. This guide does not constitute legal or
compliance advice; involve your compliance/legal contact before going live.

---

~30–45 minutes. Do these steps in order — later steps depend on IDs/URLs from earlier ones.

## 0. Prerequisites

- A Google Workspace account for the test client (needed for HIPAA BAA eligibility later;
  personal Gmail is fine for build/test purposes only)
- A Twilio account with an SMS-capable phone number ([twilio.com](https://www.twilio.com))
  — or a WhatsApp Business API sender if you're using WhatsApp instead of SMS
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- A phone number for clinic staff to receive escalation alerts

## 1. Create the Google Form

Create a form with these fields, in this order:

1. Name — short answer, required
2. Phone — short answer, required
3. Reason for Visit — **dropdown, not free text** (this is the clinical-data boundary — keep it
   a closed set): "New Patient", "Follow-up", "General Question", "Prescription Refill
   Request", "Other (non-medical)"
4. Preferred Appointment Window — dropdown ("Morning", "Afternoon", "Evening", "Anytime")

Do not add a free-text symptom/reason field. If staff need more clinical detail, that's a phone
call, not a form field.

Form → Responses tab → click the Sheets icon → **Create a new spreadsheet**. Name it something
like `Maple Street Family Practice — Intake`. Rename the auto-created "Form Responses 1" tab to
**`Intake`** (must match `CONFIG.SHEET_NAME` in `Config.gs`).

## 2. Add the tracking columns

Columns A–E hold Timestamp/Name/Phone/Reason for Visit/Preferred Appointment Window (adjust if
your form order differs, then edit `Config.gs`'s `COLUMNS` map to match). Add these headers
starting at column F:

```
F: Status | G: LastContactAt | H: NextActionAt | I: ResponseTimeSeconds |
J: AIDraftReply | K: ConversationLog | L: Approved | M: ClientId
```

Make column L a checkbox: select the column → Insert → Checkbox.

## 3. Create the Apps Script project

From the Sheet: Extensions → Apps Script. Delete the default `Code.gs` boilerplate, then
create/paste each file in this folder into the editor with matching names:

- `Config.gs`, `Twilio.gs`, `ClaudeAgent.gs`, `Code.gs`, `Reminders.gs`, `Dashboard.gs`
- `Dashboard.html` (use the HTML file type, not a `.gs` script)
- Project Settings → check "Show `appsscript.json` manifest" → paste `appsscript.json`'s content in

Edit `Config.gs`: set `CLIENT_ID`, `BUSINESS_NAME`, and `TIMEZONE`. The `SYSTEM_PROMPT` string
has the business name hardcoded — update it if you change `BUSINESS_NAME`.

## 4. Set script properties (secrets)

Project Settings (gear icon) → Script Properties → Add these:

| Property | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | from Twilio console |
| `TWILIO_AUTH_TOKEN` | from Twilio console |
| `TWILIO_FROM_NUMBER` | your Twilio number, E.164 format e.g. `+15551234567` |
| `CLAUDE_API_KEY` | from console.anthropic.com |
| `ESCALATION_PHONE_NUMBER` | staff cell, E.164 format |
| `WEBHOOK_TOKEN` | any long random string, e.g. generate with `openssl rand -hex 20` |

These never touch the Sheet or the HTML — only server-side `.gs` code reads them.

## 5. Install the triggers

Apps Script editor → left sidebar → Triggers (clock icon) → Add Trigger:

**Trigger 1 — new intake:**
- Function: `handleNewIntake`
- Event source: From spreadsheet
- Event type: On form submit
- (Installable trigger, not the automatic `onFormSubmit` — needed for `UrlFetchApp` authorization.)

**Trigger 2 — reminder sweep:** run `installReminderTrigger` once from the editor. It creates a
15-minute recurring trigger for `runScheduledFollowUps`. Re-run any time to reset it.

Approve the permission prompts (Sheets, external requests) as the account that owns the Sheet.

## 6. Deploy two web apps from the same project

**Deployment 1 — Twilio webhook (public):**
- Deploy → New deployment → type: Web app → Execute as: Me → Who has access: **Anyone**
- Copy the `/exec` URL, append `?token=<WEBHOOK_TOKEN>` — this exact URL goes to Twilio in step 7.

**Deployment 2 — Staff dashboard (private):**
- Deploy → New deployment → type: Web app → Execute as: Me →
  Who has access: **Only myself** (or "Anyone within [your domain]" for a full staff team)
- Copy this `/exec` URL — bookmark it as the dashboard link. No token needed; access is
  Google-account-gated already.

## 7. Configure Twilio

Twilio console → Phone Numbers → your number → Messaging configuration → "A message comes in"
→ Webhook → paste the Deployment 1 URL (with `?token=...`) → HTTP method: **POST**.

## 8. Test end-to-end (use a fake/test patient only — see the warning above)

1. Submit the form with your own phone number and a non-real name.
2. Within ~60 seconds you should get the first-contact SMS.
3. Check the `Intake` sheet — Status `contacted`, timing columns populated.
4. Reply with a pure logistics message, e.g. "can I move it to the afternoon" — within a few
   seconds check the sheet: `ConversationLog` has your reply, `AIDraftReply` has a draft.
5. Reply (in a separate test row) with something like "I've had a headache for two days" —
   confirm the row flips straight to `escalated`, `AIDraftReply` stays empty, and the staff
   escalation number gets a text. This is the local keyword filter catching it before Claude
   is ever called — check the Apps Script execution log to confirm `draftReply_` returned
   `reason: 'local_keyword_filter'`.
6. Open the Deployment 2 dashboard, sign in, approve the logistics draft from step 4, confirm
   you receive it by SMS and the sheet flips to `Approved = TRUE`.
7. To test reminders without waiting: edit a row's `NextActionAt` to a past time, run
   `runScheduledFollowUps` manually from the editor.

## 9. Compliance notes

- US SMS carrier rules (A2P 10DLC, STOP/HELP opt-outs) apply — confirm Twilio's built-in
  STOP-keyword handling is enabled for your number before any real traffic.
- Re-read the HIPAA warning at the top of this file before connecting this to real patients.

## Multi-tenant: adding a second client

Don't share this Spreadsheet or Apps Script project across clients. For each new client: copy
this whole Apps Script project (File → Make a copy) bound to a fresh Sheet built the same way,
repeat steps 1–8 with that client's own Twilio number/Claude key/Sheet/BAAs.
