/* Agent symbols: one crisp line icon per agent, in a rounded badge coloured by stage.
   AGENTS is the fallback registry when /api/agent/personas lacks stage, symbol or analogy. */
import type { Persona } from '../../services/api'

export type Stage = 0 | 1 | 2 | 3
export const STAGE_COLOR: Record<Stage, string> = { 0: '#54645a', 1: '#1c4639', 2: '#2f6f73', 3: '#9c4f30' }
export const STAGE_TINT: Record<Stage, string> = { 0: '#eef1ec', 1: '#e8f0ea', 2: '#e6f0f0', 3: '#f6ebe4' }
export const STAGE_NAME: Record<Stage, string> = { 0: 'Shared', 1: 'Stage 1 · From records to a person', 2: 'Stage 2 · Getting to know you', 3: 'Stage 3 · When life happens' }

export interface AgentMeta { key: string; name: string; stage: Stage; symbol: string; analogy: string; kind: 'ai' | 'code' | 'memory' | 'place' }

/** Every agent and pseudo-node the relay can draw. Pseudo-nodes ('data', 'you', 'profile', 'stage') are places, not agents. */
export const AGENTS: Record<string, AgentMeta> = {
  data: { key: 'data', name: 'Bank records', stage: 1, symbol: 'data', analogy: 'the archive', kind: 'place' },
  schema_scout: { key: 'schema_scout', name: 'Schema Scout', stage: 1, symbol: 'map', analogy: 'the surveyor', kind: 'ai' },
  feature_forge: { key: 'feature_forge', name: 'Feature Forge', stage: 1, symbol: 'anvil', analogy: 'the lab', kind: 'code' },
  pattern_hunter: { key: 'pattern_hunter', name: 'Pattern Hunter', stage: 1, symbol: 'magnifier', analogy: 'the detective', kind: 'ai' },
  archetype_namer: { key: 'archetype_namer', name: 'Archetype Namer', stage: 1, symbol: 'tags', analogy: 'the librarian', kind: 'ai' },
  narrator: { key: 'narrator', name: 'Profile Narrator', stage: 1, symbol: 'quill', analogy: 'the storyteller', kind: 'ai' },
  persona_builder: { key: 'persona_builder', name: 'Persona Builder', stage: 1, symbol: 'id-card', analogy: 'the biographer', kind: 'ai' },
  companion: { key: 'companion', name: 'Companion', stage: 2, symbol: 'ear', analogy: 'the note-taker', kind: 'memory' },
  director: { key: 'director', name: 'Director', stage: 2, symbol: 'compass', analogy: 'the show director', kind: 'ai' },
  engine: { key: 'engine', name: 'Engine', stage: 0, symbol: 'gear', analogy: 'the calculator', kind: 'code' },
  shock_generator: { key: 'shock_generator', name: 'Shock Generator', stage: 3, symbol: 'storm', analogy: 'the risk officer', kind: 'ai' },
  shock_dealer: { key: 'shock_dealer', name: 'Shock Dealer', stage: 3, symbol: 'cards', analogy: 'the dealer', kind: 'ai' },
  strategist: { key: 'strategist', name: 'Strategist', stage: 3, symbol: 'knight', analogy: 'the chess player', kind: 'ai' },
  challenger: { key: 'challenger', name: 'Challenger', stage: 3, symbol: 'shield', analogy: 'the sceptic', kind: 'ai' },
  life_planner: { key: 'life_planner', name: 'Life Planner', stage: 3, symbol: 'route', analogy: 'the route planner', kind: 'code' },
  validator: { key: 'validator', name: 'Validator and Ranker', stage: 3, symbol: 'scales', analogy: 'the referee', kind: 'code' },
  you: { key: 'you', name: 'You', stage: 2, symbol: 'you', analogy: 'you', kind: 'place' },
  profile: { key: 'profile', name: 'Your profile', stage: 2, symbol: 'id-card', analogy: 'your profile', kind: 'place' },
  stage: { key: 'stage', name: 'Pulp replies', stage: 2, symbol: 'stage', analogy: 'Pulp', kind: 'place' },
}

/** Map the many spellings agents use in events onto one registry key. */
const ALIASES: Record<string, string> = {
  ranker: 'validator', validator: 'validator', explainer: 'director', pulp: 'director', user: 'you', profile: 'profile',
  narrator: 'narrator', profile_narrator: 'narrator', archetypes: 'archetype_namer', hunter: 'pattern_hunter', features: 'feature_forge',
  persona: 'persona_builder', planner: 'life_planner', deck: 'shock_generator', csv: 'data', records: 'data', council: 'strategist',
}
export function agentKey(raw: string | undefined | null): string {
  const k = String(raw ?? '').trim().toLowerCase().replaceAll(' ', '_').replaceAll('-', '_')
  return ALIASES[k] ?? k
}
export function splitAgents(raw: string | undefined | null): string[] {
  return String(raw ?? '').split(',').map((s) => agentKey(s)).filter(Boolean)
}

/** Registry entry for a key, merging the live personas (if loaded) over the fallback. */
export function metaFor(key: string, personas?: Persona[]): AgentMeta {
  const k = agentKey(key)
  const base = AGENTS[k] ?? { key: k, name: k.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()), stage: 0 as Stage, symbol: 'gear', analogy: 'a helper', kind: 'ai' as const }
  const live = personas?.find((p) => agentKey(p.key) === k)
  if (!live) return base
  return { ...base, name: live.name || base.name, stage: (live.stage ?? base.stage) as Stage, symbol: live.symbol || base.symbol, analogy: live.analogy || base.analogy, kind: live.kind || base.kind }
}

const PATHS: Record<string, string> = {
  map: 'M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z M9 4v13.5 M15 6.5V20',
  anvil: 'M3 7h12.5a4.5 4.5 0 0 0 4.5-4 M3 7v1.5A4.5 4.5 0 0 0 7.5 13H12 M9 13l-1.5 4.5h9L15 13 M5.5 20.5h13',
  magnifier: 'M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M15.6 15.6 21 21 M7 12l2-2.2 2 1.6 2.7-3.4',
  tags: 'M3 11.5V4h7.5l9 9-7.5 7.5Z M7.5 8.2a.7.7 0 1 0 0 .1 M14 3.5l7 7',
  quill: 'M20 3.5C12.5 4.5 7.5 9.5 5 19 M20 3.5c-.7 6.3-4.6 10.4-11.2 11.6 M4 20.5l3.5-3.5 M13 8.5l-2.5 2.5',
  'id-card': 'M3.5 5h17a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 17.5v-11A1.5 1.5 0 0 1 3.5 5Z M8.5 8.6a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z M5 16.5c.7-1.6 2-2.4 3.5-2.4s2.8.8 3.5 2.4 M14.5 10h4.5 M14.5 13.5h3',
  storm: 'M7 15h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 8.3 3.4 3.4 0 0 0 7 15Z M12.5 15 10.5 19h3l-2 3',
  cards: 'M4.5 7.5 13 5.2l3.4 12.6-8.5 2.3Z M14.6 4.6l4.9 1.3-3.3 12.4 M8.3 11.2l2.3 2.8 1.2-3.4',
  route: 'M6 16a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z M18 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z M8.5 18.5h6a3 3 0 0 0 0-6h-5a3 3 0 0 1 0-6h6',
  ear: 'M7 9a5 5 0 1 1 10 0c0 3.5-3.5 4.5-3.5 7.5a3 3 0 0 1-6 .5 M10 9.5a2 2 0 0 1 4 0c0 1.7-1.8 2.2-1.8 3.8',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M15.5 8.5l-2 5-5 2 2-5Z M12 3v2 M12 19v2 M3 12h2 M19 12h2',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1',
  knight: 'M6 20.5h12 M7.5 20.5c0-3.2 1.2-5.4 3.3-7.3-2.4.3-4.6-.8-4.6-3 0-3.4 3.5-6.7 8-6.7l1 2.1c2.2 1.3 3.3 4.2 3.3 8.4v6.5 M12 7.2h.01',
  shield: 'M12 3 19 6v6c0 4.6-3 7.6-7 9-4-1.4-7-4.4-7-9V6Z M9 12l2.1 2.1L15.2 10',
  scales: 'M12 4v16 M7.5 20.5h9 M4.5 7h15 M4.5 7 2 13a2.5 2.5 0 0 0 5 0Z M19.5 7 17 13a2.5 2.5 0 0 0 5 0Z M12 4a1 1 0 1 0 0 .1',
  you: 'M12 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M4 21c1.5-4 4.5-6.2 8-6.2s6.5 2.2 8 6.2',
  stage: 'M4 4.5h16v11.5H9.5L4 20.5Z M8 9h8 M8 12.2h5',
  data: 'M12 3c3.9 0 7 1.3 7 3s-3.1 3-7 3-7-1.3-7-3 3.1-3 7-3Z M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6 M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
}

/** The bare icon as SVG paths, drawn in a 24 x 24 box. Usable inside another SVG (no wrapper). */
export function SymbolPaths({ symbol, color = 'currentColor', width = 1.6 }: { symbol: string; color?: string; width?: number }) {
  return <path d={PATHS[symbol] ?? PATHS.gear} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
}

/** A rounded badge with the agent's icon in white on its stage colour. */
export default function AgentSymbol({ agent, size = 32, personas, active = false, title }: { agent: string; size?: number; personas?: Persona[]; active?: boolean; title?: string }) {
  const m = metaFor(agent, personas)
  const color = STAGE_COLOR[m.stage]
  const isPlace = m.kind === 'place'
  return (
    <span className={`agent-badge ${active ? 'active' : ''} ${isPlace ? 'place' : ''}`} style={{ width: size, height: size, ['--agent-color' as string]: color }} title={title ?? `${m.name}: ${m.analogy}`} aria-hidden={title ? undefined : true}>
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} aria-hidden="true">
        <SymbolPaths symbol={m.symbol} color={isPlace ? color : '#fff'} width={1.7} />
      </svg>
    </span>
  )
}
