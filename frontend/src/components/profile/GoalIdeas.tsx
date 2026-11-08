/* Goals made for you: personal goal ideas tied to one signal in the account's records, re-ranked through a lens so the
   personalization can be explored. "Let Pulp choose" asks the Persona Builder model to pick and reword 3-5 of them;
   amounts and eligibility always come from code. Adding one is logged as your change and can be undone. */
import { useEffect, useState } from 'react'
import { CalendarClock, HeartHandshake, Plus, ShieldCheck, Sparkles, TrendingUp, Wand2, Check } from 'lucide-react'
import { api, type GoalIdea, type GoalIdeasResult, type GoalLens, type ProfileDoc } from '../../services/api'

const LENS_ORDER: GoalLens[] = ['balanced', 'safety', 'ambitious', 'life', 'habits']
const LENS_LABEL: Record<GoalLens, string> = { balanced: 'Balanced', safety: 'Safety first', ambitious: 'Ambitious', life: 'Life events', habits: 'Money habits' }
const FAMILY = {
  safety: { label: 'Protection', Icon: ShieldCheck },
  growth: { label: 'Growth', Icon: TrendingUp },
  life: { label: 'Life event', Icon: CalendarClock },
  habit: { label: 'Habit', Icon: HeartHandshake },
} as const
const HORIZON = { short: 'Short term', medium: 'Medium term', long: 'Long term' } as const
const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`

export default function GoalIdeas({ accountId, onAdded }: { accountId: number; onAdded: (doc: ProfileDoc) => void }) {
  const [lens, setLens] = useState<GoalLens>('balanced')
  const [data, setData] = useState<GoalIdeasResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [more, setMore] = useState(false)

  useEffect(() => {
    let live = true
    setError(null)
    api.goalIdeas(accountId, lens).then(d => { if (live) setData(d) }).catch(() => { if (live) setError('Goal ideas are not available right now.') })
    return () => { live = false }
  }, [accountId, lens])

  const askPulp = async () => {
    setAsking(true)
    try { setData(await api.goalIdeas(accountId, lens, true)) } catch { setError('Pulp could not choose just now; the ranked ideas below still apply.') }
    setAsking(false)
  }
  const add = async (idea: GoalIdea) => {
    setAdding(idea.id)
    try {
      const doc = await api.addGoalIdea(accountId, idea.id, lens)
      setAdded(s => new Set(s).add(idea.id))
      onAdded(doc)
    } catch { setError('Could not add that goal. Try again.') }
    setAdding(null)
  }

  const picks = data?.model?.picks
  const list: GoalIdea[] = picks?.length ? picks : (data?.ideas ?? [])
  const top = Math.max(0.01, ...(data?.ideas ?? []).map(i => i.lens_score))

  return (
    <section className="card gi" aria-labelledby="gi-title">
      <div className="gi-head">
        <div>
          <h2 id="gi-title">Goals made for you</h2>
          <p className="gi-sub">Each idea comes from one thing in your own records, sized from your own numbers. Change the angle to see how the picture shifts.</p>
        </div>
        <button type="button" className="bank-button" onClick={() => void askPulp()} disabled={asking} aria-busy={asking}>
          <Wand2 size={16} aria-hidden="true" /> {asking ? 'Pulp is choosing…' : 'Let Pulp choose'}
        </button>
      </div>
      <div className="gi-lenses" role="radiogroup" aria-label="Angle">
        {LENS_ORDER.map(l => (
          <button key={l} type="button" role="radio" aria-checked={lens === l} className={`gi-lens${lens === l ? ' on' : ''}`} onClick={() => setLens(l)}>{LENS_LABEL[l]}</button>
        ))}
      </div>
      {data && <p className="gi-lens-note">{data.lenses[lens]}</p>}
      {picks?.length ? <p className="gi-model"><Sparkles size={14} aria-hidden="true" /> Chosen and reworded by the Persona Builder ({data?.model?.model}). {data?.model?.note}</p> : null}
      {error && <p className="small muted" role="status">{error}</p>}
      {!data && !error && <p className="small muted">Looking through your records…</p>}
      {data && list.length === 0 && <p>No personal goal ideas stand out in these records yet. Tell Pulp what you are working toward and it will add them.</p>}
      <ul className="gi-list">
        {(more ? list : list.slice(0, 3)).map(i => {
          const fam = FAMILY[i.family] ?? FAMILY.safety
          const inProfile = i.in_profile || added.has(i.id)
          return (
            <li key={i.id} className={`gi-item fam-${i.family}`}>
              <div className="gi-item-top">
                <span className="gi-fam"><fam.Icon size={14} aria-hidden="true" /> {fam.label}</span>
                <span className="gi-fit" title="How strongly the records point to this, through the chosen angle">
                  <span className="gi-fit-bar"><i style={{ width: `${Math.min(100, (i.lens_score / top) * 100)}%` }} /></span> fit
                </span>
              </div>
              <h3>{i.label}</h3>
              {i.quote ? <q className="pf-quote">{i.quote}</q> : <p className="gi-why">{i.why}</p>}
              <p className="gi-ev"><strong>From your records:</strong> {i.evidence}</p>
              <div className="gi-foot">
                <span className="gi-target">{money(i.target_amount)} <small>in {i.target_months} months · {HORIZON[i.horizon]} · importance {i.importance} of 5</small></span>
                {inProfile
                  ? <span className="gi-in"><Check size={15} aria-hidden="true" /> In your goals</span>
                  : <button type="button" className="gi-add" onClick={() => void add(i)} disabled={adding === i.id} aria-label={`Add goal: ${i.label}`}><Plus size={15} aria-hidden="true" /> Add</button>}
              </div>
            </li>
          )
        })}
      </ul>
      {list.length > 3 && <button type="button" className="lp-btn ghost" onClick={() => setMore((v) => !v)}>{more ? 'Show fewer ideas' : `Show ${list.length - 3} more ideas`}</button>}
    </section>
  )
}
