# AIntegration — Support Team Guide

Hi Support team,

I’d love for you to try **AIntegration** (Logiwa AI Integration) and share feedback when something looks off or could be clearer. Your corrections help the whole team get better answers over time.

---

## What is AIntegration?

AIntegration is an internal assistant for **Logiwa API** questions. It draws from:

- OpenAPI (Swagger) documentation  
- Intercom Help Center articles  
- API support / Integration Engineer guides  

You can ask about endpoints, LQL, webhooks, environments, auth, mappings, and similar day-to-day API topics.

**Live URL:**  
https://cihanhartamaci.github.io/logiwa-api-consultant

---

## Sign in (Support credentials)

1. Open the URL above.  
2. Get the shared login from 1Password:  
   **https://share.1password.com/s#FgRM5XRqfo-mzRUIyV2Q7z-yY-8opr2Dgxi7dx0PxvE**  
3. Enter the username and password from that share on the sign-in screen.  
4. After sign-in, a short intro video may play — you can **Skip** if needed.

Use the **supportteam** credentials from that link only. Do not share the password outside Support / Integration channels.

---

## One-time setup: Gemini API key

Answers use your own Google Gemini key (stored **only in your browser**, not on our servers).

1. After login, open the API key field if prompted (or use the help / key instructions in the app).  
2. Create a Gemini API key in Google AI Studio if you don’t have one.  
3. Paste it into the app. It stays local to your browser session/storage.

If the key is missing or invalid, the assistant will explain how to fix it.

---

## How to use the chat

1. Type a question in the box at the bottom (e.g. *“What are the production and sandbox base URLs?”*).  
2. Press Send (or Enter).  
3. Read the answer — it should cite relevant docs where possible.  
4. Use the **suggested prompts** on the welcome screen if you want a quick start.

You can **Clear Chat History** from the left sidebar when you want a fresh thread.

---

## Feedback (this is the most important part)

Under each AI answer you’ll see **thumbs up** and **thumbs down**.

### Thumbs up
Use when the answer was helpful and accurate. This records positive feedback for the team.

### Thumbs down + correction
Use when something is wrong, incomplete, or misleading:

1. Click the thumbs-down icon.  
2. In the modal, describe **what was wrong** and **what the correct Logiwa guidance should be**.  
3. Submit.

Your correction is saved as a **pending** knowledge suggestion. The Integrations team reviews it in the **Knowledge desk** and either **approves** it (so future answers can use it) or **rejects** it.

You will **not** see Approve / Reject or the Knowledge desk yourself — that’s intentional. Support focuses on **accuracy feedback**; Integrations decides what enters the shared knowledge base.

---

## What happens after you submit a correction?

| Step | Who | What |
|------|-----|------|
| 1 | You (Support) | Thumbs down + write the correct guidance |
| 2 | System | Creates a **pending** team knowledge entry |
| 3 | Integrations | Reviews in Knowledge desk → Approve or Reject |
| 4 | Everyone | Approved items can improve future answers for the whole team |

So every careful correction you send can make the assistant smarter for Support **and** Integrations.

---

## Share Logiwa best-practice documents

Have a runbook, checklist, or integration guide that would help others? Share it:

1. In the left sidebar, click **Add best-practice doc**.  
2. Give it a clear **title** (e.g. *“Shopify order sync best practices”*).  
3. Optionally add a **reference link** (Confluence, Intercom, Google Doc…).  
4. **Paste the text** or click **Upload file** (PDF, Word .docx, Markdown, TXT, CSV, JSON, YAML, XML, or HTML). The text is pulled out of the file and shown in the box so you can check or trim it.  
5. Click **Submit for approval**.

The Integrations team reviews it. Once approved, AIntegration can find and cite it in answers for everyone.

A couple of limits: scanned PDFs (images of pages) have no selectable text, so paste the text in instead. Old Word **.doc** files aren’t supported — open them in Word and save as **.docx** first.

---

## Tips for useful feedback

- Prefer **specific, actionable** corrections (endpoint names, field names, status codes, LQL examples).  
- If the answer mixed two topics, say which part was wrong.  
- If docs disagree with the answer, mention which doc/version you trust.  
- Short is fine — clarity beats length.

---

## Privacy & security (short)

- App passwords live in **1Password** (link above) and on the secure backend — not in the public site code.  
- Your **Gemini key** stays in **your browser**.  
- Shared team knowledge is stored securely for the team (not committed into GitHub Pages as secrets).

---

## Need help or want to share overall feedback?

If something breaks (login, key, blank answers, UI issues), or if you have product ideas, reply to the person who shared this guide (or ping Integrations / Cihan).  

**Thank you** — honest thumbs and corrections from Support are hugely appreciated. They directly improve AIntegration for everyone.

—
AIntegration · Logiwa API assistant  
https://cihanhartamaci.github.io/logiwa-api-consultant
