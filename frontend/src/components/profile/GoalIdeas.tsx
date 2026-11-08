/* Goals made for you: personal goal ideas tied to one signal in the account's records, as a short list. The angle
   re-ranks them; "Let Pulp choose" asks the Persona Builder model to pick and reword a few. Amounts always come from
   code. Adding one is logged as your change and can be undone. */
import { useEffect, useState } from 'react'
import { Check, Plus, Wand2 } from 'lucide-react'
import { api, type GoalIdea, type GoalIdeasResult, type GoalLens, type ProfileDoc } from '../../services/api'
import ItemIcon from '../ItemIcon'
import { goalSymbol } from '../symbols'
import { byDate, money, shortQuote } from './ProfileLists'

const LENS_ORDER: GoalLens[] = ['balanced', 'safety', 'ambitious', 'life', 'habits']
const LENS_LABEL: Record<GoalLens, string> = { balanced: 'Balanced', safety: 'Safety first', ambitious: 'Ambitious', life: 'Life events', habits: 'Money habits' }

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
    try { setData(await api.goalIdeas(accountId, lens, true)) } catch { setError('Pulp could not choose just now; the ideas below still apply.') }
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
  // ideas not yet in your goals first, so the short list doesn't repeat the goals above it
  const list: GoalIdea[] = [...(picks?.length ? picks : (data?.ideas ?? []))].sort((x, y) => Number(x.in_profile || added.has(x.id)) - Number(y.in_profile || added.has(y.id)))

  return (
    <section className="gi gi-compact" aria-labelledby="gi-title">
      <div className="section-head">
        <h2 id="gi-title">Goals made for you</h2>
        <span className="gi-controls">
          <label className="gi-select">Angle
            <select value={lens} onChange={(e) => setLens(e.target.value as GoalLens)}>
              {LENS_ORDER.map(l => <option key={l} value={l}>{LENS_LABEL[l]}</option>)}
            </select>
          </label>
          <button type="button" className="lp-btn" onClick={() => void askPulp()} disabled={asking} aria-busy={asking}>
            <Wand2 size={14} aria-hidden="true" /> {asking ? 'Choosing…' : 'Let Pulp choose'}
          </button>
        </span>
      </div>
      <p className="pf-hint">Each one comes from something in your own records.{picks?.length ? ' Chosen and reworded by Pulp.' : ''}</p>
      {error && <p className="small muted" role="status">{error}</p>}
      {!data && !error && <p className="small muted">Looking through your records…</p>}
      {data && list.length === 0 && <p>No personal goal ideas stand out yet. Tell Pulp what you are working toward.</p>}
      <ul className="plain-list" aria-label="Goal ideas">
        {(more ? list : list.slice(0, 3)).map(i => {
          const inProfile = i.in_profile || added.has(i.id)
          return (
            <li key={i.id}>
              <ItemIcon symbol={goalSymbol(i.type)} />
              <div className="pl-main">
                <span className="pl-title">{i.label}</span>
                <span className="pl-line">{money(i.target_amount)} {byDate(i.target_months)}{i.from_records === false ? ' · a general idea' : ''}</span>
              </div>
              {inProfile
                ? <span className="gi-in"><Check size={15} aria-hidden="true" /> Added</span>
                : <button type="button" className="gi-add" onClick={() => void add(i)} disabled={adding === i.id} aria-label={`Add goal: ${i.label}`}><Plus size={15} aria-hidden="true" /> Add</button>}
              <details>
                <summary>Details</summary>
                {i.quote && <p>“{shortQuote(i.quote, 160)}”</p>}
                <p>{i.from_records === false ? 'Sized for you: ' : 'From your records: '}{i.evidence}</p>
                <p>Importance {i.importance} of 5 · {i.horizon} term</p>
              </details>
            </li>
          )
        })}
      </ul>
      {list.length > 3 && <button type="button" className="pl-more" onClick={() => setMore((v) => !v)}>{more ? 'Show fewer ideas' : `Show ${list.length - 3} more ideas`}</button>}
    </section>
  )
}
