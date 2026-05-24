# 🎙️ Alex — AI Technical Interviewer

A voice + text AI agent that conducts rigorous, structured technical interviews for ML/AI roles — powered by Claude (Anthropic) or OpenAI GPT-4o.

## Features

- **Full interview structure** — Warm-up → Project Deep Dive → Core Technical → Curveball → Feedback Report
- **Voice input** — speak your answers via microphone (Chrome/Edge on localhost)
- **Text input** — type answers if voice isn't available; always works
- **Alex speaks back** — responses are read aloud via browser TTS
- **Feedback report** — structured evaluation after the interview ends
- **No npm install** — server uses only Node.js built-in modules

## Quick Start (Claude)

```bash
# 1. Clone the repo
git clone https://github.com/ysAditya/ai-technical-interviewer.git
cd ai-technical-interviewer

# 2. Start the server (no npm install needed)
node server.js YOUR_ANTHROPIC_API_KEY

# 3. Open in Chrome
# → http://localhost:3000
```

## Models

```bash
node server.js sk-ant-xxx                          # default: claude-sonnet-4-6
node server.js sk-ant-xxx claude-opus-4-6          # most capable
node server.js sk-ant-xxx claude-haiku-4-5-20251001  # fastest / cheapest
node server.js sk-ant-xxx claude-sonnet-4-6 8080   # custom port
```

## Standalone (OpenAI, no server needed)

Open `alex-interviewer.html` directly in Chrome and enter your OpenAI API key in the setup screen.

> **Note:** Voice/mic requires the page to be served via localhost, not opened as a `file://` URL.

## Interview Phases

| Phase | Duration |
|---|---|
| Warm-up & intro | 2–3 min |
| Project deep dive | 10–15 min |
| Core technical questions | 15–20 min |
| Curveball round | 5 min |
| Candidate questions | 2 min |
| Feedback report | generated at end |

## Files

```
alex-interviewer.html   # Frontend — interview UI
server.js               # Local server — proxies to Anthropic API
```

## Requirements

- Node.js (any recent version)
- Chrome or Edge (for voice recognition)
- An Anthropic API key (`sk-ant-…`) or OpenAI API key (`sk-…`)

## Security

Your API key is passed as a command-line argument and never stored in any file. The server only listens on `127.0.0.1` (localhost) — it is not exposed to the internet.
