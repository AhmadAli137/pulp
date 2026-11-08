/* Profile: the fictional life PULP built for this account from its records, the goals with their weights, what
   makes this person unusual and how they are like others, and every change agents (or you) made to the profile. */
import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import { ChangeTimeline, GoalsTable, LikeOthers, PersonaHeader, TraitTrack } from '../components/profile/ProfileParts'
import GoalIdeas from '../components/profile/GoalIdeas'
import { useProfileDoc } from '../components/profile/useProfileDoc'
import { JuiceDrop, SqueezeLoader } from '../components/PulpMascot'
import { Card } from '../components/ui'
import { useApp } from '../stores/useApp'

export default function Profile() {
  const accountId = useApp((s) => s.accountId)
  const openPulp = useApp((s) => s.openPulp)
  const { doc, live, error, undo, refresh } = useProfileDoc(accountId, { poll: true })
  if (!accountId) return <DemoAccountPicker />
  if (!doc) return <Card title="Your profile"><SqueezeLoader label="Squeezing a life story out of your records…" /></Card>
  const p = doc.persona
  return (
    <div className="stack pf">
      {p ? (
        <section className="card pf-hero brand-banner" aria-label="Persona">
          <PersonaHeader persona={p} preview={!live} />
          <div className="pf-story">
            <h3><JuiceDrop /> Pulp’s read</h3>
            <p>{p.story}</p>
          </div>
        </section>
      ) : <Card title="Your profile"><p>No persona yet for this account.</p></Card>}

      <Card title="Goals and how much each one counts" right={<button type="button" className="bank-button" onClick={() => openPulp('I want to change one of my goals')}>Change a goal with Pulp</button>}>
        <GoalsTable goals={doc.goals.length ? doc.goals : p?.goals ?? []} />
      </Card>

      {live && <GoalIdeas accountId={accountId} onAdded={() => void refresh()} />}

      {p && (
        <div className="pf-two">
          <Card title="What worries you">
            <ul className="pf-list">{p.worries.map((w) => <li key={w.label}><strong>{w.label}</strong><small>{w.evidence}</small></li>)}</ul>
          </Card>
          <Card title="What Pulp will ask first">
            <ol className="pf-list numbered">{p.questions.map((q) => <li key={q.key}><strong>{q.text}</strong><small>Why: {q.why}</small></li>)}</ol>
            <button type="button" className="bank-button" onClick={() => openPulp(p.questions[0]?.text ? `Ask me: ${p.questions[0].text}` : undefined)}>Answer with Pulp</button>
          </Card>
        </div>
      )}

      {p && (
        <Card title="You, compared">
          <div className="pf-compare">
            <div className="pf-traits">
              <h3>What makes you unusual</h3>
              {p.traits.map((t) => <TraitTrack key={t.label} t={t} />)}
            </div>
            <div>
              <h3>How you are like others</h3>
              <LikeOthers like={p.like_others} />
              <p className="small"><Link to="/insights">See the patterns behind this in Insights</Link></p>
            </div>
          </div>
        </Card>
      )}

      <Card title="How PULP’s picture of you changed" right={<span className="small muted">{live ? 'Updates every 10 seconds' : 'Preview history'} · v{doc.version}</span>}>
        <p className="scenario-intro">Agents update your profile directly as they learn, with no confirmation step. Every change is logged here with who made it and why, and you can undo any of them.</p>
        {error && <p className="small muted" role="status">{error}</p>}
        <ChangeTimeline log={doc.log} onUndo={undo} />
      </Card>
    </div>
  )
}
