/* Developer docs (route /developers; /docs itself is FastAPI's interactive reference on the single-server build).
   The endpoint list is rendered from src/docs/openapi.json, the backend's own schema, snapshotted by
   backend/scripts/export_openapi.py. The agent roster is read live from /api/agent/personas, with a static fallback.
   The page heading ("Developer docs") comes from Layout. */
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ExternalLink, FileText, Github } from 'lucide-react'
import { Link } from 'react-router-dom'
import openapiRaw from '../docs/openapi.json?raw'
import { GROUPS, NOTES, VOICE_MESSAGES } from '../docs/endpoints'
import { api, type Persona } from '../services/api'
import { AgentFlowchart } from '../components/docs/AgentFlowchart'
import { CodeBlock } from '../components/docs/CodeBlock'
import { EndpointCard, type Components, type Operation } from '../components/docs/EndpointCard'
import { InfraDiagram } from '../components/docs/InfraDiagram'
import '../components/docs/docs.css'

type Spec = { info: { title: string; version: string }; paths: Record<string, Record<string, Operation>>; components?: { schemas?: Components } }
const SPEC = JSON.parse(openapiRaw) as Spec
const COMPS: Components = SPEC.components?.schemas ?? {}

type Ep = { method: string; path: string; op: Operation }
const ALL: Ep[] = Object.entries(SPEC.paths).flatMap(([path, ops]) =>
  Object.entries(ops).map(([method, op]) => ({ method, path, op })))
const ORDER = ['get', 'post', 'put', 'patch', 'delete']
const GROUPED = GROUPS.map((g) => ({
  ...g,
  eps: ALL.filter((e) => g.match(e.path)).sort((a, b) => a.path.localeCompare(b.path) || ORDER.indexOf(a.method) - ORDER.indexOf(b.method)),
})).filter((g) => g.eps.length)
const UNGROUPED = ALL.filter((e) => !GROUPS.some((g) => g.match(e.path)))
const OPEN_BY_DEFAULT = new Set(['POST /api/shocks/calculate', 'GET /api/agent/stage', 'POST /api/agent/life-plans'])

/* Used only when /api/agent/personas cannot be reached (for example, a static preview). */
const FALLBACK: Pick<Persona, 'key' | 'name' | 'kind' | 'stage' | 'runs_on' | 'role' | 'guardrail'>[] = [
  { key: 'schema_scout', name: 'Schema Scout', kind: 'code', stage: 1, runs_on: 'Python', role: 'Maps the bank’s columns to roles.', guardrail: 'Unknown columns are left out, never guessed.' },
  { key: 'feature_forge', name: 'Feature Forge', kind: 'code', stage: 1, runs_on: 'Python (pandas)', role: 'About 78 signals per account.', guardrail: 'Every signal is documented and recomputable.' },
  { key: 'pattern_hunter', name: 'Pattern Hunter', kind: 'ai', stage: 1, runs_on: 'Gemini on Google ADK', role: 'Tests patterns across all accounts.', guardrail: 'Cites only numbers its tools returned.' },
  { key: 'persona_builder', name: 'Persona Builder', kind: 'ai', stage: 1, runs_on: 'Code template, refined by Gemini', role: 'A fictional person for the account.', guardrail: 'Amounts come from code; every change can be undone.' },
  { key: 'companion', name: 'Companion', kind: 'memory', stage: 2, runs_on: 'Offline extractor, Gemini when configured', role: 'Turns what you say into profile updates.', guardrail: 'Changes are logged and undoable.' },
  { key: 'director', name: 'Director', kind: 'ai', stage: 2, runs_on: 'Gemini on Google ADK', role: 'Decides what to show and say each turn.', guardrail: 'Captions are checked against the engine.' },
  { key: 'engine', name: 'Engine', kind: 'code', stage: 0, runs_on: 'Python (pandas, numpy)', role: 'The official formula and the simulators.', guardrail: 'Deterministic; tested against the definitions.' },
  { key: 'life_planner', name: 'Life Planner', kind: 'code', stage: 3, runs_on: 'Python search', role: 'Hundreds of multi-step plans, four finalists.', guardrail: 'One stated objective.' },
]

const SECTIONS = [
  { id: 'intro', label: 'Introduction' },
  { id: 'quickstart', label: 'Quick start' },
  { id: 'architecture', label: 'Agents and how they interact' },
  { id: 'roster', label: 'Agent roster' },
  { id: 'turn', label: 'Anatomy of a turn' },
  { id: 'api', label: 'API reference' },
  ...GROUPED.map((g) => ({ id: g.id, label: g.title, sub: true })),
  { id: 'api-voice', label: 'Voice WebSocket', sub: true },
  { id: 'data', label: 'Data model' },
  { id: 'stack', label: 'Tech stack' },
  { id: 'infra', label: 'Infrastructure' },
  { id: 'testing', label: 'Testing' },
] as { id: string; label: string; sub?: boolean }[]

const RUN_LOCAL = `python -m pip install -r backend/requirements.txt
npm --prefix frontend ci

# terminal 1: the API on :8000
python -m uvicorn app.main:app --app-dir backend --port 8000

# terminal 2: the web app on :5173 (proxies /api and the voice WebSocket to :8000)
npm --prefix frontend run dev`

const ENV = `# .env (git-ignored). Everything runs without it; the conversation and voice need a key.
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash          # model roles
GEMINI_LIVE_MODEL=gemini-3.8-live      # voice
# optional
VULTR_INFERENCE_API_KEY=...            # fallback provider
KV_REST_API_URL=... KV_REST_API_TOKEN=...   # context storage in a key-value store instead of JSON files
PULP_DATA_DIR=...                      # another folder of CSVs`

const VERIFY = `python -m pytest backend/tests -q
npm --prefix frontend run build
node frontend/tests/voice.test.mjs
npm --prefix frontend run test:e2e     # isolated API on :8002, needs Chrome or PULP_BROWSER_EXECUTABLE`

const SNAPSHOT = `python backend/scripts/export_openapi.py   # refreshes frontend/src/docs/openapi.json`

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    // The active section is the last one whose top has scrolled past a line near the top of the window.
    let frame = 0
    const update = () => {
      frame = 0
      let current = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 140) current = id
      }
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame) }
  }, [ids])
  return active
}

function go(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(null, '', `#${id}`)
}

export default function Docs() {
  const ids = useMemo(() => SECTIONS.map((s) => s.id), [])
  const active = useActiveSection(ids)
  const [personas, setPersonas] = useState<typeof FALLBACK | null>(null)
  const [live, setLive] = useState(false)
  useEffect(() => {
    let alive = true
    api.personas().then((r) => { if (alive) { setPersonas(r.personas); setLive(true) } }).catch(() => { if (alive) setPersonas(FALLBACK) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (id) window.setTimeout(() => go(id), 50)
  }, [])
  const roster = [...(personas ?? FALLBACK)].sort((a, b) => ((a.stage ?? 0) || 9) - ((b.stage ?? 0) || 9))

  return (
    <div className="docs">
      <div className="docs-mobile-nav">
        <label htmlFor="docs-jump">On this page</label>
        <select id="docs-jump" value={active} onChange={(e) => go(e.target.value)}>
          {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.sub ? ` ${s.label}` : s.label}</option>)}
        </select>
      </div>

      <aside className="docs-sidebar" aria-label="Documentation sections">
        <div className="docs-sidebar-brand"><BookOpen size={16} aria-hidden="true" /> PULP docs</div>
        <nav>
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.id} className={s.sub ? 'sub' : ''}>
                <a href={`#${s.id}`} className={active === s.id ? 'active' : ''} aria-current={active === s.id ? 'location' : undefined}
                   onClick={(e) => { e.preventDefault(); go(s.id) }}>{s.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="docs-main">
        <header className="docs-hero" id="intro">
          <p className="docs-eyebrow">Developer guide</p>
          <h2>Planning Under Life&rsquo;s Pressures</h2>
          <p className="docs-lede">
            PULP is a financial resilience engine built for the Tangerine track (&ldquo;Resilience Rewired&rdquo;) at the Sheridan Datathon 2026.
            It reads one account&rsquo;s bank records, tests what a shock would do, and plans for before and after it hits.
            One rule holds everywhere: <strong>agents interpret, code calculates.</strong> Models choose what to look at, what to ask and how to say it;
            every number comes from deterministic Python and is checked before it is shown.
          </p>
          <div className="docs-meta">
            <span className="docs-badge">API v{SPEC.info.version}</span>
            <span className="docs-badge">{ALL.length} HTTP operations + 1 WebSocket</span>
            <span className="docs-badge">branch master</span>
            <a className="docs-btn primary" href="https://github.com/AhmadAli137/pulp" target="_blank" rel="noreferrer"><Github size={15} aria-hidden="true" /> View on GitHub</a>
            <a className="docs-btn" href="/docs" target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" /> Interactive API reference</a>
            <Link className="docs-btn" to="/report"><FileText size={15} aria-hidden="true" /> Stage 1 report</Link>
          </div>
        </header>

        <section id="quickstart" className="docs-section">
          <h3>Quick start</h3>
          <p>Use Python 3.12 and Node.js 22. From the repository root:</p>
          <CodeBlock code={RUN_LOCAL} label="shell" />
          <p>Open <code>http://localhost:5173</code>. The summary CSVs load from <code>data/</code>. For a single-server build, run
            <code> npm --prefix frontend run build</code> and open <code>http://localhost:8000</code>.</p>
          <CodeBlock code={ENV} label=".env" />
        </section>

        <section id="architecture" className="docs-section">
          <h3>Agents and how they interact</h3>
          <p>Three stages. Stage 1 runs on the records before anyone speaks. Stage 2 runs on every conversation turn, typed or spoken.
            Stage 3 runs when a shock comes up: a twist card on the Shocks page, Shuffle in the chat, or a shock or big decision you mention.
            Each arrow below is a real handoff, and the same handoffs stream to the Agents page and the panel beside the chat.</p>
          <AgentFlowchart />
        </section>

        <section id="roster" className="docs-section">
          <h3>Agent roster</h3>
          <p className="docs-muted">{live ? 'Read live from GET /api/agent/personas.' : 'Static copy: the API could not be reached.'}</p>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <caption className="docs-sr">Every agent, its stage, what it runs on, its role and its guardrail</caption>
              <thead><tr><th scope="col">Agent</th><th scope="col">Stage</th><th scope="col">Runs on</th><th scope="col">Role</th><th scope="col">Guardrail</th></tr></thead>
              <tbody>
                {roster.map((p) => (
                  <tr key={p.key}>
                    <td><strong>{p.name}</strong><span className={`docs-kind ${p.kind === 'code' ? 'code' : 'model'}`}>{p.kind === 'code' ? 'code' : 'model'}</span></td>
                    <td>{p.stage ? p.stage : 'all'}</td><td>{p.runs_on}</td><td>{p.role}</td><td>{p.guardrail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="turn" className="docs-section">
          <h3>Anatomy of a turn</h3>
          <p>A turn is one request to <code>GET /api/agent/stage</code>, answered as server-sent events. Voice turns take the same path:
            Gemini Live calls a <code>conversation_turn</code> tool on the server, which runs the same stream and relays its events.</p>
          <ol className="docs-steps">
            <li><strong>handoff / agent</strong>: who passed what to whom, and each model or tool call, as it happens.</li>
            <li><strong>trace</strong>: one observable step of any agent (stage, agent, kind, title, items). Feeds the workflow column and the Agents page.</li>
            <li><strong>profile</strong>: the profile changed this turn. Changes are applied directly and logged; saying &ldquo;no&rdquo; right after undoes them.</li>
            <li><strong>lifeplans</strong>: the Life Planner ran: counts, screens, four finalists with reasons, and plans that fall short.</li>
            <li><strong>memory</strong>: what the Companion heard, kept for older clients.</li>
            <li><strong>storyboard</strong>: what Pulp shows and says: beats with a visual and a caption, and for twists a short <code>reply</code>.</li>
            <li><strong>done</strong> or <strong>error</strong>.</li>
          </ol>
        </section>

        <section id="api" className="docs-section">
          <h3>API reference</h3>
          <p>Every HTTP endpoint the server exposes, grouped by area, rendered from the server&rsquo;s own OpenAPI schema. Base URL
            <code> https://askpulp.com</code>, or <code>http://localhost:8000</code> locally. Requests and responses are JSON unless noted.
            Click an endpoint for its parameters and examples. To refresh the snapshot after changing a route:</p>
          <CodeBlock code={SNAPSHOT} label="shell" />
          {GROUPED.map((g) => (
            <div key={g.id} id={g.id} className="docs-group">
              <h4>{g.title}</h4>
              <p className="docs-muted">{g.blurb}</p>
              {g.eps.map((e) => {
                const key = `${e.method.toUpperCase()} ${e.path}`
                return <EndpointCard key={key} method={e.method} path={e.path} op={e.op} note={NOTES[key]} comps={COMPS} defaultOpen={OPEN_BY_DEFAULT.has(key)} />
              })}
            </div>
          ))}
          {UNGROUPED.length > 0 && (
            <div className="docs-group">
              <h4>Other</h4>
              {UNGROUPED.map((e) => <EndpointCard key={`${e.method} ${e.path}`} method={e.method} path={e.path} op={e.op} note={NOTES[`${e.method.toUpperCase()} ${e.path}`]} comps={COMPS} />)}
            </div>
          )}
          <div id="api-voice" className="docs-group">
            <h4>Voice WebSocket</h4>
            <p className="docs-muted">Not in the OpenAPI schema. The server holds the Gemini Live session, so the key never reaches the browser.</p>
            <article className="docs-endpoint">
              <div className="docs-endpoint-head static">
                <span className="docs-method ws">WS</span>
                <code className="docs-path">/api/agent/voice/{'{account_id}'}</code>
                <span className="docs-endpoint-summary">A live voice conversation. Every spoken turn runs the same conversation stream as typed text.</span>
              </div>
              <div className="docs-endpoint-body">
                <div className="docs-table-wrap">
                  <table className="docs-table">
                    <caption className="docs-sr">Voice WebSocket message types</caption>
                    <thead><tr><th scope="col">type</th><th scope="col">Direction</th><th scope="col">Meaning</th></tr></thead>
                    <tbody>{VOICE_MESSAGES.map((m) => (
                      <tr key={`${m.dir}-${m.type}`}><td><code>{m.type}</code></td><td>{m.dir === 'in' ? 'browser to server' : 'server to browser'}</td><td>{m.text}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <CodeBlock label="Example message" code={`{"type": "pipeline_event", "event": "trace", "data": {"stage": 3, "agent": "life_planner", "kind": "handoff", "title": "320 plans", "to": "engine"}}`} />
              </div>
            </article>
          </div>
        </section>

        <section id="data" className="docs-section">
          <h3>Data model</h3>
          <p>The official numbers follow the judges&rsquo; definitions, from <code>monthly_summary.csv</code> and <code>loans.csv</code>:</p>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <caption className="docs-sr">Official metric definitions</caption>
              <thead><tr><th scope="col">Symbol</th><th scope="col">Name</th><th scope="col">Definition</th></tr></thead>
              <tbody>
                <tr><td><code>I</code></td><td>Typical money in</td><td>Median of <code>money_in</code></td></tr>
                <tr><td><code>S</code></td><td>Typical spending</td><td>Median of <code>money_out</code></td></tr>
                <tr><td><code>F</code></td><td>Fixed costs</td><td>Median of <code>household_bills + insurance + loan_payments</code> (shown, not added again)</td></tr>
                <tr><td><code>H</code></td><td>Household bills</td><td>Median of <code>household_bills</code></td></tr>
                <tr><td><code>B</code></td><td>Buffer</td><td>Mean of <code>avg_daily_balance</code> over the last six months</td></tr>
                <tr><td><code>P</code></td><td>Loan payment</td><td><code>monthly_payment</code> if the loan is still running at the end of 2025</td></tr>
                <tr><td>runway</td><td>Months the buffer lasts</td><td>(B − one-off cost) ÷ (S + h×H − r×I); 0 when the buffer is gone, &ldquo;no shortfall (120+)&rdquo; when income still covers spending, else capped at 120</td></tr>
              </tbody>
            </table>
          </div>
          <p>Everything PULP learns about a person lives in one context document per account (a JSON file, or a key-value store when configured):</p>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <caption className="docs-sr">Context document keys</caption>
              <thead><tr><th scope="col">Key</th><th scope="col">Holds</th><th scope="col">Written by</th></tr></thead>
              <tbody>
                <tr><td><code>goals</code>, <code>concerns</code>, <code>constraints</code>, <code>preferences</code>, <code>upcoming_events</code></td><td>Items with a value, source and timestamps; goals carry size, horizon, importance and target</td><td>Persona Builder, Companion, you</td></tr>
                <tr><td><code>accepted_actions</code>, <code>completed_actions</code></td><td>Plan steps you took on</td><td>You</td></tr>
                <tr><td><code>profile_log</code></td><td>Every change: agent, kind, before, after, reason, undone</td><td>Every writer</td></tr>
                <tr><td><code>persona</code>, <code>persona_trace</code></td><td>The fictional person and how it was built</td><td>Persona Builder</td></tr>
                <tr><td><code>deck</code></td><td>Personal shocks with likelihood and why</td><td>Shock Generator</td></tr>
                <tr><td><code>life_plans</code>, <code>plan_history</code></td><td>The latest search result and every run since</td><td>Life Planner</td></tr>
                <tr><td><code>last_deal</code></td><td>The last character and scenario dealt, so the next deal differs</td><td>Shock Dealer</td></tr>
                <tr><td><code>conversation</code>, <code>proposals</code>, <code>asked_questions</code></td><td>Recent turns, staged proposals, questions already asked</td><td>Director, Companion</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="stack" className="docs-section">
          <h3>Tech stack</h3>
          <div className="docs-cards">
            <div className="docs-card">
              <h4>Backend</h4>
              <ul>
                <li>Python 3.12, FastAPI, Uvicorn</li>
                <li>pandas, NumPy, SciPy, scikit-learn (archetype clustering)</li>
                <li>Pydantic for every request and stored record</li>
                <li>Google Agent Development Kit with the google-genai SDK</li>
                <li>Server-sent events for turns; a WebSocket for voice</li>
              </ul>
            </div>
            <div className="docs-card">
              <h4>Models</h4>
              <ul>
                <li>Gemini 3.5 Flash for every model role</li>
                <li>Gemini 3.8 Live native audio for voice, through a server-side relay</li>
                <li>Vultr Serverless Inference as an optional fallback provider</li>
                <li>Without a key, everything still runs: the engine, twist cards and plans are deterministic</li>
              </ul>
            </div>
            <div className="docs-card">
              <h4>Frontend</h4>
              <ul>
                <li>React 19, TypeScript, Vite</li>
                <li>React Router, Zustand for state</li>
                <li>Framer Motion, Recharts, lucide-react</li>
                <li>Hand-built SVG figures for every explanation</li>
              </ul>
            </div>
            <div className="docs-card">
              <h4>Storage</h4>
              <ul>
                <li>Read-only CSVs in <code>data/</code>, derived tables in <code>data/derived/</code></li>
                <li>Context as JSON files, or an Upstash or Vercel KV store over its REST API</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="infra" className="docs-section">
          <h3>Infrastructure</h3>
          <p><a href="https://askpulp.com">askpulp.com</a> runs on a Vultr instance as one Docker image that holds the API, the built web app and the voice relay,
            behind Caddy with automatic HTTPS. The CSVs are mounted into the container read-only, and context lives on a named volume.
            Every push to <code>master</code> runs the tests and the build on GitHub Actions, then redeploys over SSH with
            <code> docker compose up -d --build</code> and waits for the health check.</p>
          <InfraDiagram />
          <p className="docs-muted">Data: the PKDD&rsquo;99 Discovery Challenge Financial dataset from the CTU Prague Relational Dataset Repository,
            provided for the track as monthly summaries, transactions, loans and account records in Canadian dollars. Credits are in the README.</p>
        </section>

        <section id="testing" className="docs-section">
          <h3>Testing</h3>
          <p>Backend unit and API tests with pytest, a voice client contract test, and Playwright browser tests that drive the app against an isolated API.</p>
          <CodeBlock code={VERIFY} label="shell" />
        </section>
      </main>
    </div>
  )
}
