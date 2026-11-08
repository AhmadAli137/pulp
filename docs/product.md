# Product and design guide

Pulp is a financial planning workspace with conversation as its main interaction. It should feel considered and professional while keeping the demo nature and evidence limits clear. A banking-style visual language is not a claim of banking authorization, deposit protection or financial execution.

## One workspace

The page names and destinations are centralized in [`workspace.tsx`](../frontend/src/components/workspace.tsx). The sidebar, mobile navigation and home menu use the same catalog. Each supporting page has a purpose statement, a useful next destination and a **Talk it through** link. These links prefill an editable conversation draft; they do not submit a message automatically.

| Route | Page | Connection |
|---|---|---|
| `/` | Planning room | Voice/text, proposals, personal decisions, optional figures and agent flow |
| `/twin` | Your financial picture | Recorded facts beside confirmed context; leads into insights |
| `/insights` | Insights & evidence | Observations, life effects, unknowns and questions; leads into comparisons |
| `/shock` | Prepare for a setback | Exact-input shock arithmetic and conditional planning options |
| `/explore` | Compare possibilities | Historical simulations under explicit alternatives |
| `/goals` | Goals & choices | Saved goal/preferences populate the form; shared plan and changes are visible |
| `/roadmap` | Your next steps | Suggested actions with trade-offs and review conditions |
| `/settings` | Preferences & data | Accessibility, connection status and saved-context controls |

`/classic` and `/companion` redirect to `/`. Old source files for those experiences are not separate active product surfaces.

## Conversation and questions

- One native Gemini Live voice, started by the user. Typing during voice stays in the same session. Text-only replies are silent.
- Routine replies are concise conversation. Ask one useful missing question instead of forcing a visual or a long intake questionnaire.
- Explain a fact's relevance to a real choice. Distinguish observed records, user-confirmed details, modeled outcomes and unknowns.
- A vacation needs its own budget and timing. A monthly service needs its stated price. A recurring transfer needs its purpose before proposing changes.
- Confirmation saves personal context; it is not financial authorization. A calculated candidate that needs spending or work-capacity information remains an **Option to discuss**.
- The styled question block emphasizes the question with larger serif text and a decorative question mark. User text remains ordinary conversation.

## Visual system

[`workspace.css`](../frontend/src/workspace.css) supplies the shared evergreen, parchment and copper palette, serif headings, fine rules and geometric accents. It loads after the established styles and [`refinement.css`](../frontend/src/refinement.css). Shared chart colors are in [`charts/index.tsx`](../frontend/src/charts/index.tsx). Prefer these shared foundations over new page-specific palettes.

Figures remain optional. Responsive scenario cards use two columns on desktop and one on phones, replacing the clipped rotating fan. Text-heavy visuals grow with their content; detailed visuals can open in a larger dialog. Preserve existing figure animation and replay, and respect reduced-motion preferences.

The **Agents** toggle starts closed on each page mount. It shows actual observed steps and handoff payload summaries for the latest conversation turn; chronological activity is not falsely labeled as a handoff. It is a trace of events, not access to private model reasoning. Historical research traces start paused; playback scrolls inside the trace, not the entire page.

## Insights that lead somewhere

`ProfileInsights` first shows evidence, its possible life effect, the decision it informs, and a question where context is missing. Supporting archetypes and research detail are expandable. A question links back to an editable conversation draft. Archetype guesses must remain identified as guesses.

Use progressive detail: a practical question first, assumptions and source records available, full research and advanced controls retained. Do not add an agent simply to increase the count. A new role needs a defined input, useful output, failure behavior and evidence that it improves a user decision.

## Responsive and interaction checks

Every destination is checked at desktop and phone widths. Wide financial tables scroll within labeled regions. Comparison branches stack on narrow screens. Keyboard focus, dialog closing, message entry, account changes and mobile navigation must remain usable. The test suite checks important interactions and layout overflow; it does not establish complete accessibility certification or human usability validation.
