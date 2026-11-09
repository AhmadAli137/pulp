/* The agents and how they hand work to each other, in three stage lanes. Hand-built SVG so every label stays crisp.
   Kinds: model = Gemini on Google ADK; code = deterministic Python; engine = the only source of numbers; data = inputs,
   storage and the screen. */

type Kind = 'model' | 'code' | 'engine' | 'data'
type Node = { id: string; x: number; y: number; name: string; sub?: string; kind: Kind; w?: number; h?: number }
type Edge = { from: string; to: string; label?: string; path?: string; lx?: number; ly?: number; dashed?: boolean; anchor?: 'start' | 'middle' }

const W = 120
const H = 48

const NODES: Node[] = [
  // Stage 1
  { id: 'csv', x: 24, y: 118, name: 'Bank records', sub: '9 CSV files', kind: 'data' },
  { id: 'scout', x: 196, y: 118, name: 'Schema Scout', sub: 'maps columns to roles', kind: 'code' },
  { id: 'forge', x: 368, y: 118, name: 'Feature Forge', sub: '79 signals each', kind: 'code' },
  { id: 'hunter', x: 556, y: 62, name: 'Pattern Hunter', sub: 'tests patterns', kind: 'model' },
  { id: 'namer', x: 556, y: 118, name: 'Archetype Namer', sub: 'six groups', kind: 'model' },
  { id: 'narrator', x: 556, y: 174, name: 'Profile Narrator', sub: 'one line per flag', kind: 'model' },
  { id: 'persona', x: 760, y: 118, name: 'Persona Builder', sub: 'fictional life, goals', kind: 'model' },
  { id: 'ctx', x: 1040, y: 150, name: 'Context document', sub: 'profile, log, plans', kind: 'data', h: 190, w: 140 },
  // Stage 2
  { id: 'you', x: 24, y: 316, name: 'You, typing', sub: 'text in the panel', kind: 'data' },
  { id: 'voice', x: 24, y: 378, name: 'Gemini Live relay', sub: 'voice, WebSocket', kind: 'model' },
  { id: 'director', x: 368, y: 346, name: 'Director', sub: 'what to show and say', kind: 'model' },
  { id: 'companion', x: 700, y: 346, name: 'Companion', sub: 'hears goals, worries', kind: 'model' },
  // Stage 3, council row
  { id: 'generator', x: 24, y: 628, name: 'Shock Generator', sub: 'personal deck', kind: 'code' },
  { id: 'dealer', x: 24, y: 548, name: 'Shock Dealer', sub: 'card and character', kind: 'model' },
  { id: 'engineA', x: 196, y: 548, name: 'Engine', sub: 'official formula', kind: 'engine' },
  { id: 'strategist', x: 368, y: 548, name: 'Strategist', sub: 'proposes levers', kind: 'model' },
  { id: 'validatorA', x: 540, y: 548, name: 'Validator', sub: 'clamps, re-scores', kind: 'code' },
  { id: 'challengerA', x: 712, y: 548, name: 'Challenger', sub: 'flags the unlikely', kind: 'model' },
  { id: 'rankerA', x: 884, y: 548, name: 'Ranker', sub: 'one objective', kind: 'code' },
  // Stage 3, Life Planner row
  { id: 'planner', x: 196, y: 716, name: 'Life Planner', sub: '~300 multi-step plans', kind: 'code' },
  { id: 'engineB', x: 368, y: 716, name: 'Engine', sub: 'month by month', kind: 'engine' },
  { id: 'validatorB', x: 540, y: 716, name: 'Validator', sub: 'screens, per rule', kind: 'code' },
  { id: 'rankerB', x: 712, y: 716, name: 'Ranker', sub: 'Pareto set', kind: 'code' },
  { id: 'challengerB', x: 884, y: 716, name: 'Challenger', sub: 'checks finalists', kind: 'model' },
  { id: 'final', x: 1040, y: 582, name: 'Director', sub: '4 finalists, and', kind: 'model', h: 92 },
  { id: 'ui', x: 1040, y: 748, name: 'Your screen', sub: 'Shocks, My Plan, Pulp', kind: 'data' },
]
const BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]))

const hOf = (n: Node) => n.h ?? H
const right = (n: Node) => [n.x + (n.w ?? W), n.y + hOf(n) / 2] as const
const left = (n: Node) => [n.x, n.y + hOf(n) / 2] as const

const EDGES: Edge[] = [
  { from: 'csv', to: 'scout', label: 'headers' },
  { from: 'scout', to: 'forge', label: 'role map' },
  { from: 'forge', to: 'hunter' }, { from: 'forge', to: 'namer', label: 'signals' }, { from: 'forge', to: 'narrator' },
  { from: 'hunter', to: 'persona' }, { from: 'namer', to: 'persona', label: 'group, flags' }, { from: 'narrator', to: 'persona' },
  { from: 'persona', to: 'ctx', label: 'seeds goals, worries' },
  { from: 'you', to: 'director', label: 'message' },
  { from: 'voice', to: 'director', label: 'conversation_turn' },
  { from: 'director', to: 'companion', label: 'what you said', path: 'M 488 362 L 700 362', lx: 594, ly: 354 },
  { from: 'companion', to: 'director', label: 'changes made', path: 'M 700 382 L 488 382', lx: 594, ly: 400 },
  { from: 'companion', to: 'ctx', label: 'apply and log (undo)', path: 'M 820 370 C 930 370, 950 300, 1040 300', lx: 940, ly: 356 },
  { from: 'director', to: 'dealer', label: 'a shock or decision is mentioned', path: 'M 428 394 L 428 504 L 84 504 L 84 548', lx: 438, ly: 428, anchor: 'start' },
  { from: 'generator', to: 'dealer', label: 'deck', path: 'M 84 628 L 84 596', lx: 92, ly: 616, anchor: 'start' },
  { from: 'dealer', to: 'engineA', label: 'shock' },
  { from: 'engineA', to: 'strategist', label: 'frozen request' },
  { from: 'strategist', to: 'validatorA', label: 'levers' },
  { from: 'validatorA', to: 'challengerA', label: 'scored' },
  { from: 'challengerA', to: 'rankerA', label: 'flags' },
  { from: 'rankerA', to: 'final', label: 'ranked' },
  { from: 'dealer', to: 'planner', label: 'same shock', path: 'M 144 590 C 172 650, 168 704, 196 740', lx: 174, ly: 662, anchor: 'start' },
  { from: 'planner', to: 'engineB', label: 'plans' },
  { from: 'engineB', to: 'validatorB', label: 'outcomes' },
  { from: 'validatorB', to: 'rankerB', label: 'feasible' },
  { from: 'rankerB', to: 'challengerB', label: 'frontier' },
  { from: 'challengerB', to: 'final', label: 'finalists' },
  { from: 'final', to: 'ui', path: 'M 1100 674 L 1100 748', lx: 1108, ly: 714, label: 'plans', anchor: 'start' },
]

function edgePath(e: Edge): { d: string; lx: number; ly: number } {
  if (e.path) return { d: e.path, lx: e.lx ?? 0, ly: e.ly ?? 0 }
  const a = BY_ID[e.from], b = BY_ID[e.to]
  const [x1, y1] = right(a)
  const [x2, y2] = left(b)
  const dx = Math.max(24, (x2 - x1) / 2)
  if (y1 === y2) {
    // Neighbours in a row: the gap is narrow, so the label sits just above the nodes, centred on the gap.
    return { d: `M ${x1} ${y1} L ${x2} ${y2}`, lx: (x1 + x2) / 2, ly: y1 - 29 }
  }
  return { d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2 - 7 }
}

const LANES = [
  { y: 16, h: 232, title: 'Stage 1 · From records to a person', note: 'runs before anyone speaks' },
  { y: 262, h: 180, title: 'Stage 2 · Getting to know you', note: 'every conversation turn' },
  { y: 456, h: 352, title: 'Stage 3 · When life happens', note: 'when a shock comes up' },
]

export function AgentFlowchart() {
  return (
    <figure className="docs-figure">
      <div className="docs-legend" aria-hidden="true">
        <span><i className="lg model" />Model role (Gemini on Google ADK)</span>
        <span><i className="lg code" />Deterministic code</span>
        <span><i className="lg engine" />Engine: the only source of numbers</span>
        <span><i className="lg data" />Inputs, storage, screen</span>
      </div>
      <div className="docs-diagram-scroll" tabIndex={0} aria-label="Agent flowchart, scrolls sideways on small screens">
        <svg className="docs-flow" viewBox="0 0 1200 900" role="img" aria-labelledby="flow-title flow-desc">
          <title id="flow-title">How PULP's agents hand work to each other</title>
          <desc id="flow-desc">Stage 1 turns bank records into signals, groups, flags and a fictional persona stored in the context document.
            Stage 2: the Director and the Companion handle each typed or spoken turn and update the profile directly, with undo.
            Stage 3: when a shock or decision comes up, the Shock Dealer picks a card; the planning council (Engine, Strategist, Validator,
            Challenger, Ranker) and the Life Planner search (Life Planner, Engine, Validator, Ranker, Challenger) both report to the Director,
            which shows four finalists and the plans that fall short.</desc>
          <defs>
            <marker id="docs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="docs-arrowhead" />
            </marker>
          </defs>
          {LANES.map((l) => (
            <g key={l.title}>
              <rect x={8} y={l.y} width={1184} height={l.h} rx={14} className="docs-lane" />
              <text x={24} y={l.y + 26} className="docs-lane-title">{l.title}</text>
              <text x={24 + l.title.length * 7.4 + 14} y={l.y + 26} className="docs-lane-note">{l.note}</text>
            </g>
          ))}
          <text x={196} y={522} className="docs-row-label">Planning council</text>
          <text x={196} y={694} className="docs-row-label">Life Planner search</text>
          {EDGES.map((e) => {
            const { d, lx, ly } = edgePath(e)
            return (
              <g key={`${e.from}-${e.to}`}>
                <path d={d} className={`docs-edge${e.dashed ? ' dashed' : ''}`} markerEnd="url(#docs-arrow)" />
                {e.label && <text x={lx} y={ly} className="docs-edge-label" textAnchor={e.anchor ?? 'middle'}>{e.label}</text>}
              </g>
            )
          })}
          {NODES.map((n) => (
            <g key={n.id} className={`docs-node ${n.kind}`}>
              <rect x={n.x} y={n.y} width={n.w ?? W} height={hOf(n)} rx={10} />
              {n.kind === 'engine' && <rect x={n.x + 3} y={n.y + 3} width={(n.w ?? W) - 6} height={hOf(n) - 6} rx={8} className="docs-engine-inner" />}
              <text x={n.x + (n.w ?? W) / 2} y={n.y + (n.id === 'final' ? 34 : n.id === 'ctx' ? 86 : 21)} textAnchor="middle" className="docs-node-name">{n.name}</text>
              {n.sub && <text x={n.x + (n.w ?? W) / 2} y={n.y + (n.id === 'final' ? 52 : n.id === 'ctx' ? 104 : 37)} textAnchor="middle" className="docs-node-sub">{n.sub}</text>}
              {n.id === 'final' && <text x={n.x + W / 2} y={n.y + 68} textAnchor="middle" className="docs-node-sub">plans that fall short</text>}
            </g>
          ))}
          <g>
            <rect x={8} y={826} width={1184} height={58} rx={12} className="docs-guard" />
            <text x={600} y={851} textAnchor="middle" className="docs-guard-title">Guardrail: numbers only come from the Engine</text>
            <text x={600} y={871} textAnchor="middle" className="docs-guard-sub">Model roles choose, phrase and propose. Code clamps, re-scores and checks every number a model writes against the engine before it is shown.</text>
          </g>
        </svg>
      </div>
      <figcaption>The Engine appears twice because both planners call it: the council scores levers with the official formula, the Life Planner simulates each plan month by month.</figcaption>
    </figure>
  )
}
