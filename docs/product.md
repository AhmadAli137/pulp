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

`ProfileInsights` first shows evidence, its possible life effect, the decision it informs, and a question where context is missing. Occupation guesses, archetype dashboards and research diagnostic controls are removed from the user interface. A question links back to an editable conversation draft. Keep source periods, uncertainty and links to the decision each observation informs.

Use progressive detail: a practical question first, assumptions and source records available, full research and advanced controls retained. Do not add an agent simply to increase the count. A new role needs a defined input, useful output, failure behavior and evidence that it improves a user decision.

## Responsive and interaction checks

Every destination is checked at desktop and phone widths. Wide financial tables scroll within labeled regions. Comparison branches stack on narrow screens. Keyboard focus, dialog closing, message entry, account changes and mobile navigation must remain usable. The test suite checks important interactions and layout overflow; it does not establish complete accessibility certification or human usability validation.


## Financial overview and briefings

The financial picture starts with user-reported assets and liabilities, goal-progress rings and a proportional outflow allocation strip. The duplicate historical line charts and vulnerability grid have been removed from this page; scenario comparisons live on the shock page. Balance comparisons use a shared scale; goal rings show unknown progress as a question mark rather than zero. All visual quantities have adjacent text. The design is implemented in `FinancialOverview.tsx` and its shared stylesheet.

A balance sheet is explicitly dated and partial until the user marks it complete. Goal savings are allocations of assets, not additional assets. Goal deadlines derive from the original goal creation date plus its stated duration; monthly pace is a remaining-gap calculation, not an affordability guarantee. Savings observations keep their own date when other goal details change.

`/briefings` provides a daily focus and a trailing seven-day summary. Both are generated when opened. They report the latest saved personal updates, goals, existing plan options and missing questions; they are not an immutable change log or a claim of new bank activity. No automatic delivery, notifications or email are scheduled. This matches the initial in-app delivery choice.

The conversation profile tool includes reported balances and goal progress. Timing, budget and already-saved amounts inform follow-up questions. Proposed spoken or typed savings still require confirmation; the balance and progress forms save only on explicit submission. Saving details marks an existing plan stale. Strategy simulations retain their historical buffer assumptions: reported assets are not automatically treated as accessible cash, and current goal savings are not silently added to projected funds.

## Selective animated walkthroughs

Scenario and comparison responses with consecutive visual beats play in one inline `AnimatedWalkthrough`, with previous/next, pause, replay and a readable transcript. Ordinary acknowledgements and intake questions remain conversational. Questions following a sequence are available immediately; playback never blocks message entry. Random twist draws retain their shuffle reveal before impact, alternatives and actions. Typed walkthroughs advance automatically; reduced-motion and live-voice walkthroughs use manual progression initially. Playback has no speech synthesis: Gemini Live remains the only conversational voice.


## Resilience is the primary journey

The planning room foregrounds the original customer ? shock ? preparation and backup plan journey, with a direct `/shock` entry and expandable research finding. Conversation remains the default home experience. The shock page places baseline numbers, exact controls, verdict and both plans before optional personalized strategies and customer research. It omits the shared-plan banner above the calculation to avoid presenting an unrelated earlier plan as the selected shock result.

Explicit twist requests bypass intake for fresh accounts. Follow-up questions personalize conditional options after results are available. Changed shock inputs hide the preceding verdict and plans until recalculation, preventing old results from appearing under a new duration. Expanded features remain available; this refocus does not integrate reported net worth into the historical simulation or establish a timed human judging outcome.


## Feature pruning: understanding and decisions

A primary feature must help a person understand their current position, compare a possible future, or decide on a next step. Four main destinations remain: conversation, current finances, scenarios and goals. Reviews, evidence and settings use a secondary disclosure in navigation. Daily/weekly briefings and the default-closed agent flow remain available as explicitly requested supporting tools.

The Explore screen and its editable simulation path count are retired; `/explore` redirects to `/shock`. Duplicate shock controls, historical/vulnerability charts in the financial picture, research quartile/archetype/feature dashboards, occupation guesses, strategy scatter charts, plan version tables and repeated strategy cards in briefings are removed from the UI. The underlying analytical services remain for grounded calculations and research reproduction.

Plan options now show practical action language, assumed monthly changes, modeled consequences and missing context. Model provenance, engine calls, scoring weights, objective formulas and challenger role labels are not user controls. Scenario mismatch or stale context hides earlier option results until comparison is refreshed. Goals distinguish reported progress from modeled future progress and link directly to next steps.
