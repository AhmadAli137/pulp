/* How the agents chose these four: the Life Planner's search as a funnel that is also a real chart. Round by round,
   every candidate is a dot: generated (Life Planner), placed on the resilience x goals plane once simulated (Engine),
   failing screens drop into a tray counted per rule (Validator), dominated ones fade (Ranker, "beaten by" on hover),
   the Pareto set stays outlined, and four finalists lift out with their roles. Self-contained: it takes the search
   and the finalists and needs nothing else. Reduced motion shows the final state. */
import { Cog, Compass, Pause, Play, RotateCcw, Route, Scale, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LifePlan, PlanSearch } from '../../services/api'
import { ROLE, domainOf, pct, roleOf, useReducedMotion } from './palette'
import './plans.css'

const W = 640, PLOT_B = 330, H = 440, M = { l: 58, r: 16, t: 14 }
const TRAY_T = 372
const AGENTS: Record<string, { name: string; Icon: LucideIcon }> = {
  life_planner: { name: 'Life Planner', Icon: Route }, engine: { name: 'Engine', Icon: Cog },
  validator: { name: 'Validator', Icon: ShieldCheck }, ranker: { name: 'Ranker', Icon: Scale }, strategist: { name: 'Strategist', Icon: Route },
  director: { name: 'Director', Icon: Compass }, challenger: { name: 'Challenger', Icon: ShieldCheck },
}

export default function PlanSearchView({ search, plans, animate = true }: { search: PlanSearch; plans: LifePlan[]; animate?: boolean }) {
  const reduced = useReducedMotion()
  const still = reduced || !animate
  const [stage, setStage] = useState(still ? 4 : 0)
  const [playing, setPlaying] = useState(!still)
  const host = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(still)
  const cands = search.candidates
  const xd = useMemo(() => domainOf([...cands.map((c) => c.resilience), ...plans.map((p) => p.components.resilience)]), [cands, plans])
  const yd = useMemo(() => domainOf([...cands.map((c) => c.goals), ...plans.map((p) => p.components.goals)]), [cands, plans])
  const unit = (v: number, d: { lo: number; hi: number }) => Math.max(0, Math.min(1, (v - d.lo) / (d.hi - d.lo || 1)))
  const PX = (v: number) => M.l + unit(v, xd) * (W - M.l - M.r)
  const PY = (v: number) => PLOT_B - unit(v, yd) * (PLOT_B - M.t)
  // Five visual stages; the agent for each comes from the search's own rounds where it names one.
  const agentFor = (re: RegExp, fallback: string) => search.rounds.find((r) => re.test(r.title))?.agent ?? fallback
  const rounds = [
    { round: 1, agent: agentFor(/generat/i, 'life_planner'), title: 'Generated decision combinations', count: search.generated },
    { round: 2, agent: 'engine', title: 'Simulated each one month by month', count: search.generated },
    { round: 3, agent: agentFor(/feasib|screen/i, 'validator'), title: 'Screened out the infeasible', count: search.feasible },
    { round: 4, agent: agentFor(/frontier|pareto/i, 'ranker'), title: 'Kept the Pareto frontier', count: search.pareto },
    { round: 5, agent: agentFor(/finalist/i, 'ranker'), title: 'Picked four distinct finalists', count: search.finalists },
  ]
  useEffect(() => { if (still) { setStage(4); setPlaying(false) } }, [still])
  useEffect(() => {
    if (seen || !host.current) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setSeen(true) }, { threshold: 0.35 })
    io.observe(host.current)
    return () => io.disconnect()
  }, [seen])
  useEffect(() => {
    if (!playing || !seen || stage >= 4) { if (stage >= 4) setPlaying(false); return }
    const t = setTimeout(() => setStage((s) => s + 1), stage === 0 ? 1100 : 1600)
    return () => clearTimeout(t)
  }, [playing, seen, stage])

  const rules = useMemo(() => {
    const fromCands = [...new Set(cands.filter((c) => c.status === 'screened').map((c) => c.reason ?? 'Other'))]
    const named = search.screens.map((s) => s.rule)
    return [...named, ...fromCands.filter((r) => !named.includes(r))]
  }, [cands, search.screens])
  const layout = useMemo(() => {
    const n = cands.length || 1
    const cols = Math.ceil(Math.sqrt(n * 2.2)), rows = Math.ceil(n / cols)
    const gx = (W - M.l - M.r) / cols, gy = (PLOT_B - M.t) / Math.max(rows, 1)
    const binW = (W - M.l - M.r) / Math.max(1, rules.length)
    const fill = new Map<string, number>()
    return cands.map((c, i) => {
      const grid = { x: M.l + gx * (i % cols + 0.5), y: M.t + gy * (Math.floor(i / cols) + 0.5) }
      const plane = { x: PX(c.resilience), y: PY(c.goals) }
      let tray = plane
      if (c.status === 'screened') {
        const b = Math.max(0, rules.indexOf(c.reason ?? 'Other'))
        const k = fill.get(String(b)) ?? 0
        fill.set(String(b), k + 1)
        const per = Math.max(4, Math.floor((binW - 10) / 6))
        tray = { x: M.l + b * binW + 7 + (k % per) * 6, y: TRAY_T + 28 + Math.floor(k / per) * 6 }
      }
      return { grid, plane, tray }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cands, rules, xd, yd])
  const finalistLabels = plans.map((p) => ({ id: p.id, x: PX(p.components.resilience), y: PY(p.components.goals), role: ROLE[roleOf(p.role)] })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < finalistLabels.length; i++) if (finalistLabels[i].y - finalistLabels[i - 1].y < 15) finalistLabels[i].y = finalistLabels[i - 1].y + 15
  const finalIds = new Set(plans.map((p) => p.id))
  const counts = [search.generated, search.generated, search.feasible, search.pareto, search.finalists]
  const binW = (W - M.l - M.r) / Math.max(1, rules.length)
  const screenCount = (rule: string) => search.screens.find((s) => s.rule === rule)?.removed ?? cands.filter((c) => c.status === 'screened' && (c.reason ?? 'Other') === rule).length

  return (
    <div className="lp-search" ref={host}>
      <div className="lp-search-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${search.generated} plans generated, ${search.screened_out} screened out, ${search.pareto} on the Pareto frontier, ${search.finalists} finalists`}>
          {stage >= 1 && xd.ticks.map((t) => (
            <g key={`x${t}`} className="lp-fade-in">
              <line x1={PX(t)} x2={PX(t)} y1={M.t} y2={PLOT_B} className="lp-grid" />
              <text x={PX(t)} y={PLOT_B + 16} className="lp-tick" textAnchor="middle">{Math.round(t * 100)}%</text>
            </g>
          ))}
          {stage >= 1 && yd.ticks.map((t) => (
            <g key={`y${t}`} className="lp-fade-in">
              <line x1={M.l} x2={W - M.r} y1={PY(t)} y2={PY(t)} className="lp-grid" />
              <text x={M.l - 8} y={PY(t) + 4} className="lp-tick" textAnchor="end">{Math.round(t * 100)}%</text>
            </g>
          ))}
          {stage >= 1 && <>
            <text x={(M.l + W - M.r) / 2} y={PLOT_B + 32} className="lp-axis" textAnchor="middle">Staying solvent (resilience) →</text>
            <text transform={`translate(15 ${(M.t + PLOT_B) / 2}) rotate(-90)`} className="lp-axis" textAnchor="middle">Reaching your goals →</text>
          </>}
          {stage === 0 && <text x={W / 2} y={PLOT_B + 26} className="lp-axis" textAnchor="middle">{search.generated} combinations of real decisions, before any numbers</text>}
          {stage >= 2 && rules.map((r, i) => (
            <g key={r} className="lp-fade-in">
              <line x1={M.l + i * binW + 4} x2={M.l + (i + 1) * binW - 4} y1={TRAY_T + 18} y2={TRAY_T + 18} className="lp-tray-line" />
              <text x={M.l + i * binW + 6} y={TRAY_T + 12} className="lp-tray-label">{rules.length > 4 ? `${i + 1} · −${screenCount(r)}` : `−${screenCount(r)} · ${r.length > 26 ? `${r.slice(0, 25)}…` : r}`}<title>{r}</title></text>
            </g>
          ))}
          {stage >= 2 && <text x={M.l - 8} y={TRAY_T + 12} className="lp-tick" textAnchor="end">out</text>}
          {cands.map((c, i) => {
            const L = layout[i]
            const pos = stage === 0 ? L.grid : stage >= 2 && c.status === 'screened' ? L.tray : L.plane
            const kind = stage < 2 ? 'raw' : c.status === 'screened' ? 'screened' : stage < 3 ? 'raw' : c.status === 'dominated' ? 'dominated' : stage < 4 || !finalIds.has(c.id) ? 'pareto' : 'final'
            const delay = still ? 0 : (i % 50) * 9
            const t = `${c.name} · resilience ${pct(c.resilience)} · goals ${pct(c.goals)}${c.reason ? ` · ${c.reason}` : ''}`
            return (
              <g key={c.id} className={`lp-sd lp-sd-${kind}`} style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, transitionDelay: `${delay}ms` }}>
                <title>{t}</title>
                {kind === 'screened' ? <path d="M-2.4 -2.4 L2.4 2.4 M2.4 -2.4 L-2.4 2.4" /> : <circle r={kind === 'dominated' ? 2.6 : kind === 'pareto' ? 5 : kind === 'final' ? 0 : 3} />}
              </g>
            )
          })}
          {stage >= 4 && plans.map((p) => {
            const role = ROLE[roleOf(p.role)]
            return <circle key={p.id} className="lp-sd-finalist" cx={PX(p.components.resilience)} cy={PY(p.components.goals)} r={9} fill={role.color} stroke="#fff" strokeWidth={2}><title>{`${role.label}: ${p.name}`}</title></circle>
          })}
          {stage >= 4 && finalistLabels.map((l) => {
            const right = l.x < W * 0.7
            return <text key={l.id} className="lp-pt-label lp-fade-in" x={l.x + (right ? 14 : -14)} y={l.y + 4} textAnchor={right ? 'start' : 'end'} fill={l.role.color}>{l.role.label}</text>
          })}
        </svg>
      </div>
      <div className="lp-search-side">
        <ol className="lp-rounds">
          {rounds.map((r, i) => {
            const a = AGENTS[r.agent] ?? { name: r.agent, Icon: Cog }
            const state = i < stage ? 'done' : i === stage ? 'now' : 'next'
            return (
              <li key={r.round} className={`lp-round ${state}`}>
                <button type="button" onClick={() => { setPlaying(false); setStage(i) }} aria-current={i === stage ? 'step' : undefined}>
                  <span className="lp-round-icon"><a.Icon size={14} aria-hidden="true" /></span>
                  <span className="lp-round-text"><b>{a.name}</b> {r.title}</span>
                  <span className="lp-round-count">{(counts[i] ?? r.count).toLocaleString()}</span>
                </button>
                {i === 2 && stage >= 2 && search.screens.length > 0 && (
                  <ol className="lp-screens">{rules.map((r, k) => <li key={r}><span>{k + 1}. {r}</span><b>−{screenCount(r)}</b></li>)}</ol>
                )}
              </li>
            )
          })}
        </ol>
        <div className="lp-search-controls">
          {playing
            ? <button type="button" className="lp-btn" onClick={() => setPlaying(false)}><Pause size={13} aria-hidden="true" /> Pause</button>
            : <button type="button" className="lp-btn" onClick={() => { if (stage >= 4) setStage(0); setSeen(true); setPlaying(true) }}>{stage >= 4 ? <><RotateCcw size={13} aria-hidden="true" /> Replay</> : <><Play size={13} aria-hidden="true" /> Play</>}</button>}
          <span className="small muted" role="status">{rounds[stage]?.title} · {(counts[stage] ?? 0).toLocaleString()}</span>
        </div>
        <p className="lp-search-note">Hover a dot to see the plan and, for faded ones, the plan that beats it. Code does every calculation; the agents only propose and explain.</p>
      </div>
    </div>
  )
}
