# Integrations as implemented

This describes the repository, not prize eligibility or provider guarantees. Original event requirements remain in the [event brief](event-brief.md).

| Integration | Current use | Boundary |
|---|---|---|
| Tangerine challenge data | Mapped summary CSVs, official arithmetic, historical features, cohorts and scenario calibration | Historical anonymized dataset, not live banking |
| Gemini / google-genai | Structured companion extraction; retained standalone chat tools | Proposals need confirmation; failures can fall back to the offline extractor |
| Google ADK | Director, optional Strategist and Challenger, profile narration, archetype naming and research tools | Code calculates and validates; roles do not all run on every turn |
| Gemini Live | Native audio over `/api/agent/voice/{account_id}`; the `conversation_turn` tool calls shared stage orchestration | Requires provider access, microphone permission and a working WebSocket |
| Vultr hosting | Primary `askpulp.com` deployment: Docker application behind Caddy | One-worker demo architecture |
| Vultr Serverless Inference | Optional companion/extraction provider via the OpenAI-compatible transport | Does not replace Gemini Live or all ADK roles; offline provider tests use mocks |
| GoDaddy DNS / Caddy | Domain routing and HTTPS configuration | See the committed Caddyfiles and deployment guide |
| Redis REST | Optional context persistence, with file storage as the alternative | Not distributed transaction safety or user authorization |
| React / Recharts / SVG / motion | Optional inline figures, charts, responsive cards, replay and reduced-motion behavior | A2UI and Rive are not integrated |

The native voice client is [`frontend/src/services/voice.ts`](../frontend/src/services/voice.ts), with [`backend/app/api/voice.py`](../backend/app/api/voice.py) as relay. Browser speech synthesis is not the default on the active home. ElevenLabs is not part of this experience.

Runtime prompts are in the backend source. The historical files in `prompts/` describe a proposed future contract and must not be mistaken for loaded model prompts. Model defaults live in [configuration](../.env.example); provider availability and latency can vary.

GitHub is the source and release destination. Entire-related historical references do not imply current session tracking or a separate release pipeline. Vercel configuration remains secondary/legacy; use Vultr to verify the complete voice-capable application.

See [architecture](architecture.md), [deployment](deployment.md) and [testing](testing.md).
