# Testing and verification

## Local release checks

Use Python 3.12 and Node 22 for parity with CI. Install dependencies and build the frontend before browser tests:

```sh
python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
python -m pytest backend/tests -q
node frontend/tests/voice.test.mjs
npm --prefix frontend run build
npm --prefix frontend run test:e2e
python docs/agents/validate_examples.py
```

The last application-code verification on November 8, 2026 passed 137 backend tests, 15 browser tests and one voice-client test. Re-run the relevant commands for a new code change; do not preserve these counts as if they were a permanent contract.

## Isolation and requirements

Backend tests disable live provider keys and remote context storage and use temporary context directories. Some tests need the supplied dataset. Browser tests launch `backend/scripts/browser_test_server.py` on port 8002 with temporary storage and offline providers. They refuse to reuse an occupied port so a developer's API or saved context is not accidentally mutated.

The browser suite uses Playwright with installed Google Chrome by default. `PULP_BROWSER_CHANNEL` can choose another installed supported channel. The voice journey uses fake media and a mocked WebSocket; the separate voice-client regression tests audio streaming, event handling and cleanup without a live Gemini account. A failed microphone-permission test must still leave typed input available.

## Important coverage

- Official metrics and financial edge cases; simulation reproducibility and source-data checks.
- Context confirmation, version conflicts, saved plan continuity and user spending constraints.
- Strategist validation before Challenger review.
- Vacation confirmation, repeated yes, missing goal details and rejected-caption recovery.
- Evidence-linked decision profiles, protected spending, transfer uncertainty and explicit-price comparisons.
- Voice/text continuity, no duplicate browser narration, denial handling and teardown.
- Responsive cards, figure expansion, emphasized questions, and closed-by-default agent flow.
- All workspace destinations at desktop and phone widths, bounded table scrolling, shared navigation and insight links that prefill an editable conversation draft.

These are regression tests. They do not establish complete accessibility compliance, factual accuracy of every possible model answer, or that the selected questions are optimal for real people.

## What CI actually runs

The current deployment workflow runs:

```sh
python -m pytest -q backend/tests/test_tangerine_metrics.py backend/tests/test_director.py backend/tests/test_council.py backend/tests/test_planning_session.py
node frontend/tests/voice.test.mjs
npm --prefix frontend run build
```

The workflow uses a backend working directory for its equivalent pytest command. It does **not** currently run the full backend suite, browser suite, or full organizer-export audit. Check [the workflow](../.github/workflows/deploy.yml) before describing coverage.

## Data and research reproduction

```sh
python backend/scripts/analyze_population.py
python backend/scripts/pulp_research.py
python backend/scripts/validate_pulp_data.py --data-dir /path/to/full/organizer/export
python backend/scripts/run_stage1.py --no-ai
```

These scripts can write derived/research artifacts. Run them intentionally and review resulting changes. The full-export audit needs `transactions.csv`, which is omitted from the smaller deployment data subset. Original matched-pair findings and supplementary analyses have different populations; retain their denominators. See [methodology](methodology.md) and [findings](findings.md).

## Documentation checks

`docs/agents/validate_examples.py` validates two historical synthetic blueprint fixtures, their arithmetic and local links in that package. It does not validate the production API schema. Check links across the whole documentation tree separately when reorganizing files, and keep proposed contracts clearly labeled.

Financial overview coverage includes partial balance sheets, negative net positions, unknown versus zero savings, overfunded goals, date boundaries, invalid entries, saved progress persistence, and daily/weekly briefing navigation. Briefings are tested against saved context updates, not fabricated bank activity.
