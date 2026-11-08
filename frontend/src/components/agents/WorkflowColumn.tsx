/* The workflow column beside the Pulp chat: the current turn's relay, live, plus the plan-search funnel when
   Stage 3 ran. Reads the shared agent feed, so it shows text and voice turns alike. */
import { ChevronDown, ChevronUp, Network } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Persona } from '../../services/api'
import { isOfflineTurn, useAgentFeed, type FeedEvent, type FeedTurn } from '../../stores/agentFeed'
import AgentSymbol, { splitAgents } from './AgentSymbol'
import AgentRelay from './AgentRelay'
import SearchFunnel from './SearchFunnel'
import './agents.css'

export default function WorkflowColumn({ personas, onNavigate }: { personas: Persona[]; onNavigate?: () => void }) {
  const turns = useAgentFeed((s) => s.turns)
  const latest = turns.at(-1)?.turn ?? null
  const [pick, setPick] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  // Follow the newest turn unless the reader picked an older one.
  useEffect(() => { setPick(null) }, [latest])
  const turn = turns.find((t) => t.turn === (pick ?? latest)) ?? null
  const recent = turns.slice(-4)
  const offline = isOfflineTurn(turn)
  const summary = turn ? summarise(turn) : []

  return (
    <section className={`pulp-workflow ${collapsed ? 'collapsed' : ''}`} aria-label="Agent workflow">
      <header className="pulp-workflow-head">
        <Network size={15} aria-hidden="true" />
        <div><strong>Agent workflow{offline && <em className="pulp-offline" title="No model ran this turn: the engine grid alone scored and ranked the options.">Offline: engine only</em>}</strong><span>{turn ? `${turn.label} · ${turn.events.length} ${turn.events.length === 1 ? 'step' : 'steps'}` : 'Waiting for your first message'}</span></div>
        <button type="button" className="pulp-workflow-collapse" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? 'Show agent workflow' : 'Hide agent workflow'}>{collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
      </header>
      {!collapsed && (
        <div className="pulp-workflow-body">
          {recent.length > 1 && (
            <div className="pulp-workflow-turns" role="group" aria-label="Recent turns">
              {recent.map((t) => <button key={t.turn} type="button" aria-pressed={t.turn === turn?.turn} onClick={() => setPick(t.turn)} title={`${t.label}${isOfflineTurn(t) ? ' (offline)' : ''}`}>{t.source === 'voice' ? 'Voice' : t.label.length > 22 ? t.label.slice(0, 21) + '…' : t.label}{isOfflineTurn(t) && <i className="pulp-offline-dot" aria-label="offline" />}</button>)}
            </div>
          )}
          {turn?.plans?.search && (
            <div className="pulp-workflow-funnel">
              <strong>{turn.plans.search.generated} plans searched for “{turn.plans.shock.label}”</strong>
              <SearchFunnel search={turn.plans.search} compact />
            </div>
          )}
          {summary.length > 0 && (
            <dl className="pulp-workflow-summary" aria-label="What the agents did this turn">
              {summary.map((row) => (
                <div key={row.label}>
                  <dt><AgentSymbol agent={row.agent} size={20} personas={personas} />{row.label}</dt>
                  <dd><b>{row.event.title}</b>{!!row.event.items?.length && <ul>{row.event.items.slice(0, 4).map((it, i) => <li key={i}>{it}</li>)}</ul>}</dd>
                </div>
              ))}
            </dl>
          )}
          <AgentRelay key={turn?.turn ?? 'none'} events={turn?.events ?? []} personas={personas} compact live label="This turn's agent relay" />
          <p className="pulp-workflow-foot"><Link to="/agents" onClick={onNavigate}>See all three stages on the Agents page</Link></p>
        </div>
      )}
    </section>
  )
}

const has = (e: FeedEvent, keys: string[]) => splitAgents(e.agent).some((k) => keys.includes(k))
const sends = (e: FeedEvent, keys: string[]) => splitAgents(e.to).some((k) => keys.includes(k))

/** Four rows a reader can scan, built only from steps that actually ran this turn. */
function summarise(turn: FeedTurn): { label: string; agent: string; event: FeedEvent }[] {
  const ev = turn.events
  const rows: { label: string; agent: string; event: FeedEvent }[] = []
  const received = ev.find((e) => e.kind === 'handoff' && sends(e, ['strategist', 'life_planner', 'shock_dealer']) && !has(e, ['you']))
    ?? ev.find((e) => e.kind === 'handoff' && has(e, ['you']))
  if (received) rows.push({ label: 'The agents received', agent: splitAgents(received.to)[0] ?? 'companion', event: received })
  const proposed = [...ev].reverse().find((e) => has(e, ['strategist']) && (e.kind === 'handoff' || e.kind === 'output'))
  if (proposed) rows.push({ label: 'The Strategist proposed', agent: 'strategist', event: proposed })
  const byChallenger = ev.filter((e) => has(e, ['challenger']) && (e.kind === 'handoff' || e.kind === 'output'))
  const flagged = byChallenger.find((e) => /flag|review/i.test(e.title)) ?? byChallenger.at(-1)
  if (flagged) rows.push({ label: 'The Challenger flagged', agent: 'challenger', event: flagged })
  const checks = ev.filter((e) => e.kind === 'handoff' && has(e, ['validator', 'engine']) && sends(e, ['director', 'validator', 'challenger']))
  const validated = checks.find((e) => sends(e, ['director'])) ?? checks.at(-1)
  if (validated) rows.push({ label: has(validated, ['engine']) ? 'The engine validated' : 'The engine and ranker validated', agent: splitAgents(validated.agent)[0], event: validated })
  return rows
}
