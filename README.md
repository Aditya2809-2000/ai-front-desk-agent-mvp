# AI Front-Desk Agent — MVP Platform

Two vertical apps built on the same architecture:

- [`real-estate-agent/`](real-estate-agent/) — lead intake + follow-up for solo/small real estate brokers
- [`solo-clinic-agent/`](solo-clinic-agent/) — appointment intake + logistics follow-up for solo clinics

Both are **Google Apps Script** projects bound to a Google Sheet. Apps Script was chosen over
n8n/Make for the MVP because it gives us, for free, in one runtime:

- native Google Form → Sheet writes (no integration code needed)
- cron-equivalent scheduling via time-driven triggers (the reminder engine)
- a webhook endpoint (`doPost`) for inbound Twilio/WhatsApp messages
- a web app endpoint (`doGet`) that serves the owner's approval dashboard
- `PropertiesService`, which is Apps Script's equivalent of per-project environment variables

This satisfies the brief's trigger/orchestration, messaging, and dashboard layers without
standing up separate infrastructure. n8n/Make remain a valid Phase 2 swap if you outgrow Apps
Script's quotas (see `SETUP.md` in each app for the ceiling).

## How the two apps differ

| | Real estate | Clinic |
|---|---|---|
| Form fields | name, phone, property interest, budget range, preferred contact time | name, phone, reason for visit (non-clinical categories only), preferred appointment window |
| LLM system prompt | property Q&A + scheduling logistics | **appointment logistics only** — hard-refuses anything clinical |
| Extra safety layer | — | local keyword pre-filter runs *before* any text reaches Claude; a hit skips the LLM entirely and escalates straight to staff |
| Escalation | complex negotiation / financing questions → human agent number | anything symptom-, diagnosis-, or treatment-shaped → human line, no AI involvement |

## Shared architecture (both apps)

```
Google Form  →  Google Sheet (native "Form Responses" write)
                     │
                     ▼  installable "On form submit" trigger
              handleNewLead(e)  →  builds first-contact SMS  →  Twilio  →  logs status
                     │
        every 15 min: time-driven trigger → runScheduledFollowUps()
                     │ (scans sheet for rows whose NextActionAt <= now)
                     ▼
              sends reminder / follow-up  →  updates sheet

Inbound SMS/WhatsApp reply
        │
        ▼  Twilio webhook → doPost(e) in the Apps Script Web App
   match phone to sheet row → Claude API (scoped system prompt) → write DRAFT reply
   to sheet, Approved = FALSE.  Nothing is sent to the lead/patient automatically.
        │
        ▼
   Owner opens the dashboard (doGet web app), reviews the draft, clicks Approve →
   google.script.run calls sendApprovedReply(row) → Twilio sends it → status updated
```

## Security model

- **Per-client isolation**: each client gets their own Apps Script project bound to their own
  Spreadsheet. There is no shared spreadsheet, no shared script, and no shared trigger across
  clients — isolation is structural, not row-level filtering.
- **Credentials**: Twilio SID/Auth Token, the Claude API key, and the escalation phone number
  live in that project's `PropertiesService.getScriptProperties()` — Apps Script's env-var
  equivalent. They are never written to sheet cells, never embedded in the HTML dashboard, and
  never sent to the browser (the dashboard calls server-side `google.script.run` functions;
  the client-side HTML never sees a secret).
- **No PII in URLs/logs**: the Twilio webhook is `doPost` (body, not query string). Phone
  numbers are masked to last 4 digits before anything touches `Logger.log`. Full numbers only
  ever exist in the Sheet (access-controlled by normal Google Sheets sharing) and in the
  Twilio API call itself.
- **Clinic-only clinical-data guard**: `solo-clinic-agent` never asks a symptom/diagnosis
  question on the form, and runs a local keyword filter on every inbound reply before deciding
  whether to call Claude at all. See `solo-clinic-agent/ClaudeAgent.gs` and its README section
  "Clinical-data boundary" for exact behavior and its limits — it's a best-effort MVP guard,
  not a compliance certification.

## Deliverable scope (this repo)

This repo is the **codebase + deployment guide** for the end-to-end flow described in the
brief: form submission → automated first contact (within 60s) → reminder sequence →
dashboard visibility, for **one test client**. Multi-tenant scaling is the "copy this project,
point it at a new Sheet, set new script properties" step documented at the bottom of each
`SETUP.md` — deliberately not automated yet, per the brief's "single test client, then
generalize" sequencing.

I don't have your Google Workspace, Twilio, or Anthropic credentials, so I can't deploy this
for you from here — each `SETUP.md` is a copy-pasteable, ordered checklist to get from zero to
a working test client in about 30–45 minutes.

## Where to start

1. Pick the vertical: [`real-estate-agent/SETUP.md`](real-estate-agent/SETUP.md) or
   [`solo-clinic-agent/SETUP.md`](solo-clinic-agent/SETUP.md).
2. Follow it top to bottom for your one test client.
3. Come back here for the multi-tenant story once that client is live.
