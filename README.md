# Salaar AI — Intelligence for Your Ambition

![Salaar AI](assets/logo.png)

**Founder & Creator:** Yahya Salar Hassan  
**Helpers Team:** Hassan Farooq, Awais Hassan, Hajjar Hassan

> Intelligence for Your Ambition — AI Workspace for Learning, Writing, Coding & PDF Tools

## 🚀 Features

- **AI Chat** — Groq `openai/gpt-oss-120b` main, Gemini `3.8-flash` backup
- **Image & File Reading** — Upload image/file, ask "what is in this image?" — Powered by Gemini 3.8-flash with `x-goog-api-key` header support for `AQ.` keys
- **Code Generation** — Groq gpt-oss-120b
- **PDF Tools**
    - Analyze PDF with Gemini 3.8-flash (auto model discovery for AQ. keys)
    - Create PDF with PDFKit — Direct Download
- **Coming Soon:** Image Generation (Direct Download)
- **PWA Installable** — Install as app, logo.png as app icon, favicon, chatbot avatar
- **Design:** Old hero design preserved — Logo → Name → Tagline → Founder → YOUR AI WORKSPACE

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS — No frameworks, preserved IDs like `messageInput`, `chatMessages`, `codePrompt`, `imagePrompt`
- **Backend:** Node.js + Express
- **AI Models:**
    - Groq: `openai/gpt-oss-120b` (chat/code main)
    - Gemini: `gemini-3.8-flash` (backup, PDF, images) — Supports `AQ.` keys via `x-goog-api-key` header + auto fallback to `gemini-2.0-flash`, `gemini-1.5-flash`
- **PDF:** PDFKit for creation, Gemini inline_data for analysis
- **PWA:** manifest.webmanifest + sw.js

## 📁 Project Structure
