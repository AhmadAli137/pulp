/* Profile: who PULP thinks is behind this account, and what matters most. A compact person card with the top goal,
   top worry and first question, then one section at a time: Goals, Worries & questions, How you compare, History. */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MoreLinks } from '../components/workspace'
import '../components/clarity.css'
import DemoAccountPicker from '../components/DemoAccountPicker'
import ExplainButton from '../components/ExplainButton'
import ItemIcon from '../components/ItemIcon'
import { ChangeTimeline, LikeOthers, TraitTrack } from '../components/profile/ProfileParts'
import { byDate, GoalList, money, QuestionList, WorryList } from '../components/profile/ProfileLists'
import GoalIdeas from '../components/profile/GoalIdeas'
import { useProfileDoc } from '../components/profile/useProfileDoc'
import { SqueezeLoader } from '../components/PulpMascot'
import { goalSymbol, questionSymbol, worrySymbol } from '../components/symbols'
import { Card } from '../components/ui'
import { useApp } from '../stores/useApp'

const TABS = [
  { key: 'goals', label: 'Goals' },
  { key: 'worries', label: 'Worries & questions' },
  { key: 'compare', label: 'How you compare' },
  { key: 'history', label: 'History' },
] as const
type TabKey = typeof TABS[number]['key']

export default function Profile() {
  const accountId = useApp((s) => s.accountId)
  const openPulp = useApp((s) => s.openPulp)
  const { doc, live, error, undo, refresh } = useProfileDoc(accountId, { poll: true })
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'goals') as TabKey
  const setTab = (k: TabKey) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', k); return n }, { replace: true })
  const [allChanges, setAllChanges] = useState(false)
  const [allTraits, setAllTraits] = useState(false)
  if (!accountId) return <DemoAccountPicker />
  if (!doc) return <Card title="Your profile"><SqueezeLoader label="Squeezing a life story out of your records…" /></Card>
  const p = doc.persona
  const goals = doc.goals.length ? doc.goals : p?.goals ?? []
  const topGoal = [...goals].sort((a, b) => b.weight - a.weight)[0]
  const topWorry = p?.worries[0]
  const firstQ = p?.questions[0]
  const conf = p ? Math.round(Math.max(0, Math.min(1, p.occupation.confidence)) * 100) : 0

  return (
    <div className="stack pf pf-simple">
      {p ? (
        <section className="pf-card brand-banner" aria-label="Persona">
          <div className="pf-who">
            <div className="pf-avatar" aria-hidden="true">{p.display_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
            <div className="pf-who-text">
              <div className="section-head"><h2>{p.display_name}</h2><ExplainButton topic="persona" label="the person behind the account" /></div>
              <p className="pf-who-line">{p.age != null ? `${p.age}, ` : ''}{p.life_stage.toLowerCase()} · {p.household.toLowerCase()}</p>
              <p className="pf-who-meta">Probably: {p.occupation.label.toLowerCase()} <span>({conf}% sure)</span> · fictional, built from the records{!live ? ' · preview' : ''}</p>
            </div>
          </div>
          <ul className="pf-top" aria-label="What matters most">
            {topGoal && <li><button type="button" onClick={() => setTab('goals')}><ItemIcon symbol={goalSymbol(topGoal.type)} /><span><small>Top goal</small><b>{topGoal.label}</b><em>{money(topGoal.target_amount)} {byDate(topGoal.target_months)}</em></span></button></li>}
            {topWorry && <li><button type="button" onClick={() => setTab('worries')}><ItemIcon symbol={worrySymbol(topWorry.type)} /><span><small>Top worry</small><b>{topWorry.label}</b></span></button></li>}
            {firstQ && <li><button type="button" onClick={() => setTab('worries')}><ItemIcon symbol={questionSymbol(firstQ.key)} /><span><small>Pulp will ask first</small><b>{firstQ.text}</b></span></button></li>}
          </ul>
        </section>
      ) : <Card title="Your profile"><p>No persona yet for this account.</p></Card>}

      <div className="pf-tabs" role="tablist" aria-label="Profile sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`pf-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`pf-panel-${t.key}`}
            className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <section className="pf-panel" role="tabpanel" id={`pf-panel-${tab}`} aria-labelledby={`pf-tab-${tab}`}>
        {tab === 'goals' && (
          <>
            <div className="section-head">
              <h2>Your goals</h2>
              <span className="pf-actions"><ExplainButton topic="goals" label="your goals" /><button type="button" className="lp-btn" onClick={() => openPulp('I want to change one of my goals')}>Change a goal with Pulp</button></span>
            </div>
            <GoalList goals={goals} />
            {live && <GoalIdeas accountId={accountId} onAdded={() => void refresh()} />}
          </>
        )}
        {tab === 'worries' && p && (
          <div className="pf-cols">
            <div>
              <h2>What worries you</h2>
              <WorryList persona={p} />
            </div>
            <div>
              <div className="section-head"><h2>What Pulp will ask first</h2></div>
              <QuestionList persona={p} />
              <button type="button" className="lp-btn" onClick={() => openPulp(firstQ?.text ? `Ask me: ${firstQ.text}` : undefined)}>Answer with Pulp</button>
            </div>
          </div>
        )}
        {tab === 'compare' && p && (
          <div className="pf-cols">
            <div>
              <h2>What makes you unusual</h2>
              {(allTraits ? p.traits : p.traits.slice(0, 3)).map((t) => <TraitTrack key={t.label} t={t} />)}
              {p.traits.length > 3 && <button type="button" className="pl-more" onClick={() => setAllTraits((v) => !v)}>{allTraits ? 'Show fewer' : `Show ${p.traits.length - 3} more`}</button>}
            </div>
            <div>
              <h2>Who you are like</h2>
              <LikeOthers like={p.like_others} />
              <p className="small"><Link to="/insights">See the patterns behind this in Insights</Link></p>
            </div>
          </div>
        )}
        {tab === 'history' && (
          <>
            <div className="section-head"><h2>How PULP’s picture of you changed</h2><span className="small muted">{live ? 'Updates every 10 seconds' : 'Preview history'} · v{doc.version}</span></div>
            <p className="pf-hint">Agents update your profile as they learn. Undo anything that is wrong.</p>
            {error && <p className="small muted" role="status">{error}</p>}
            <ChangeTimeline log={allChanges ? doc.log : doc.log.slice(0, 5)} onUndo={undo} />
            {doc.log.length > 5 && <button type="button" className="pl-more" onClick={() => setAllChanges((v) => !v)}>{allChanges ? 'Show the latest 5' : `Show all ${doc.log.length} changes`}</button>}
          </>
        )}
      </section>

      <MoreLinks links={[
        { to: '/twin', text: 'Review account details and balances' },
        { to: '/plan', text: 'See how your goals play out in My Plan' },
      ]} />
    </div>
  )
}
