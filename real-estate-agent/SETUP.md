# Real Estate Broker AI Agent — Setup (single test client)

~30–45 minutes. Do these steps in order — later steps depend on IDs/URLs from earlier ones.

## 0. Prerequisites

- A Google account (Workspace or plain Gmail is fine) for the test client
- A Twilio account with an SMS-capable phone number ([twilio.com](https://www.twilio.com))
  — or a WhatsApp Business API sender if you're using WhatsApp instead of SMS
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- A phone number the broker will use to receive escalation alerts

## 1. Create the Google Form

Create a form with these fields (match names/types, they don't need to match exactly but keep
this order so the Sheet columns line up):

1. Name — short answer, required
2. Phone — short answer, required (add a regex validation for digits if you want)
3. Property Interest — short answer or dropdown (e.g. "Buying", "Renting", "Selling", or free text)
4. Budget Range — dropdown (e.g. "<$300k", "$300k–500k", "$500k–750k", "$750k+")
5. Preferred Contact Time — dropdown ("Morning", "Afternoon", "Evening", "Anytime")

Form → Responses tab → click the Sheets icon → **Create a new spreadsheet**. Name it something
like `Riverside Realty — Leads`. This creates the "Form Responses 1" sheet — rename that tab
to **`Leads`** (must match `CONFIG.SHEET_NAME` in `Config.gs`).

## 2. Add the tracking columns

In the `Leads` sheet, columns A–E now hold Timestamp/Name/Phone/Property Interest/Budget Range,
and F holds Preferred Contact Time (adjust if your form order differs — then edit
`Config.gs`'s `COLUMNS` map to match). Add these headers starting at column G:

```
G: Status | H: LastContactAt | I: NextActionAt | J: ResponseTimeSeconds |
K: AIDraftReply | L: ConversationLog | M: Approved | N: ClientId
```

Make column M a checkbox: select the column → Insert → Checkbox.

## 3. Create the Apps Script project

From the Sheet: Extensions → Apps Script. Delete the default `Code.gs` boilerplate content,
then create/paste each file in this folder into the editor with matching names:

- `Config.gs`, `Twilio.gs`, `ClaudeAgent.gs`, `Code.gs`, `Reminders.gs`, `Dashboard.gs`
- `Dashboard.html` (use the HTML file type, not a `.gs` script)
- Project Settings → check "Show `appsscript.json` manifest" → paste `appsscript.json`'s content in

Edit `Config.gs`: set `CLIENT_ID`, `BUSINESS_NAME`, and `TIMEZONE` for this client. The
`SYSTEM_PROMPT` string has the business name hardcoded twice for clarity — update both if you
change `BUSINESS_NAME`.

## 4. Set script properties (secrets)

Project Settings (gear icon) → Script Properties → Add these:

| Property | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | from Twilio console |
| `TWILIO_AUTH_TOKEN` | from Twilio console |
| `TWILIO_FROM_NUMBER` | your Twilio number, E.164 format e.g. `+15551234567` |
| `CLAUDE_API_KEY` | from console.anthropic.com |
| `ESCALATION_PHONE_NUMBER` | broker's cell, E.164 format |
| `WEBHOOK_TOKEN` | any long random string, e.g. generate with `openssl rand -hex 20` |

These never touch the Sheet or the HTML — only server-side `.gs` code reads them.

## 5. Install the triggers

In the Apps Script editor, left sidebar → Triggers (clock icon) → Add Trigger:

**Trigger 1 — new lead:**
- Function: `handleNewLead`
- Event source: From spreadsheet
- Event type: On form submit
- (This must be added as an *installable* trigger this way — not the automatic `onFormSubmit`
  — so it has authorization to call `UrlFetchApp` for Twilio.)

**Trigger 2 — reminder sweep:** run `installReminderTrigger` once from the editor (select it in
the function dropdown, click Run). It programmatically creates a 15-minute recurring trigger
for `runScheduledFollowUps`. Re-run it any time to reset the schedule.

On first run of either, Google will prompt you to authorize the script's permissions (Sheets,
external requests, etc.) — approve as the account that owns this Sheet.

## 6. Deploy two web apps from the same project

Apps Script lets one project have multiple independent deployments with different access
levels. You need two:

**Deployment 1 — Twilio webhook (public):**
- Deploy → New deployment → type: Web app
- Execute as: Me
- Who has access: **Anyone**
- Deploy, copy the `/exec` URL. Append `?token=<WEBHOOK_TOKEN>` (the value you set in step 4)
  to it — this is the exact URL you give Twilio in step 7.

**Deployment 2 — Owner dashboard (private):**
- Deploy → New deployment → type: Web app
- Execute as: Me
- Who has access: **Only myself** (or "Anyone within [your domain]" if the broker's team should
  see it too)
- Deploy, copy this `/exec` URL — this is the dashboard link you bookmark. Do not append the
  webhook token to this one; it doesn't need it, access is already Google-account-gated.

Two deployments, two URLs, same code — the access-control difference is what keeps the
dashboard private while still letting Twilio (which can't do Google sign-in) reach the webhook.

## 7. Configure Twilio

In the Twilio console → Phone Numbers → your number → Messaging configuration:
- "A message comes in" → Webhook → paste the Deployment 1 URL from step 6 (with `?token=...`)
  → HTTP method: **POST**

If you're using WhatsApp Business API instead of SMS, the equivalent is the WhatsApp Sender's
webhook configuration — same URL, same token.

## 8. Test end-to-end

1. Submit the Google Form as a test lead with your own phone number.
2. Within ~60 seconds you should receive the first-contact SMS.
3. Check the `Leads` sheet — Status should be `contacted`, `LastContactAt`/`NextActionAt`/
   `ResponseTimeSeconds` populated.
4. Reply to the SMS from your phone.
5. Within a few seconds, check the sheet again — `ConversationLog` should show your reply, and
   (unless it tripped the escalation rules) `AIDraftReply` should have a drafted response.
6. Open the Deployment 2 dashboard URL, sign in, find your test lead in the approval queue,
   click **Approve & Send**. Confirm you receive that reply by SMS and the sheet updates to
   `Approved = TRUE`.
7. To test reminders without waiting 24 hours: manually edit that row's `NextActionAt` cell to
   a time in the past, then run `runScheduledFollowUps` manually from the Apps Script editor.
8. To test escalation: reply with something like "what's your financing rate" — should flip the
   row to `escalated` and text the `ESCALATION_PHONE_NUMBER`.

## 9. Compliance note

US SMS is subject to A2P 10DLC registration requirements and carrier opt-out rules (STOP/HELP).
Twilio handles STOP-keyword opt-outs automatically at the platform level for most number types —
confirm this is enabled for your number/messaging service in the Twilio console before sending
real leads live traffic. This MVP does not implement its own opt-out list.

## Multi-tenant: adding a second client

Don't share this Spreadsheet or Apps Script project across clients. For each new client: copy
this whole Apps Script project (File → Make a copy) bound to a fresh Sheet built the same way,
repeat steps 1–8 with that client's own Twilio number/Claude key/Sheet. That's the deliberate
Phase 1 → Phase 2 boundary called out in the top-level README.
