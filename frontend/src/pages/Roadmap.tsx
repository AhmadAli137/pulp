import { useEffect, useState } from 'react'
import { api, type Roadmap as RoadmapT, type RoadmapAction } from '../services/api'
import { useApp } from '../stores/useApp'
import { Card, Chip, Empty, ErrorBox, Spinner, fmt } from '../components/ui'

function Action({ a }: { a: RoadmapAction }) {
  return (
    <div className="action">
      <div className="row between"><span className="a">{a.action}</span>{a.amount != null && <Chip>{fmt.money(a.amount)}</Chip>}</div>
      <div className="small">{a.expected_effect}</div>
      <div className="meta">
        <span><strong>Goal:</strong> {a.goal}</span>
        <span><strong>Trade-offs:</strong> {a.tradeoffs}</span>
        <span><strong>Assumptions:</strong> {a.assumptions}</span>
        <span><strong>Review when:</strong> {a.review_trigger}</span>
      </div>
    </div>
  )
}

export default function Roadmap() {
  const { accountId, profile, lastReplan } = useApp()
  const [rm, setRm] = useState<RoadmapT | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (accountId) api.roadmap(accountId).then(setRm).catch((e) => setErr(e.message)) }, [accountId, lastReplan])
  if (!profile) return <Empty>Select an account first.</Empty>
  if (err) return <ErrorBox msg={err} />
  if (!rm) return <Empty><Spinner /></Empty>
  const groups: [string, RoadmapAction[]][] = [['This week', rm.this_week], ['This month', rm.this_month], ['Next three months', rm.next_three_months], ['Next year', rm.next_year], ['Long term', rm.long_term]]
  return (
    <div className="stack">
      <Card dark title="Where this roadmap comes from">
        <div className="grid cols-3">
          <div><div className="muted small">Goal</div><div className="strong">{rm.summary.goal.label}</div><div className="small muted">{fmt.money(rm.summary.goal.target_amount)} in {rm.summary.goal.target_months} months</div></div>
          <div><div className="muted small">Recommended strategy</div><div className="strong">{rm.summary.recommended}</div><div className="small muted">capacity {fmt.money(rm.summary.capacity_per_month)}/mo</div></div>
          <div><div className="muted small">Layoff twist today</div><div className="small">{rm.summary.layoff_verdict}</div></div>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>{rm.summary.goal_plan_note} Nothing is executed automatically; every action is a suggestion for you to decide on.</p>
      </Card>
      <div className="timeline">
        {groups.map(([t, acts]) => (
          <div key={t} className="tl-group">
            <h3>{t}</h3>
            <div className="grid cols-2">{acts.map((a) => <Action key={a.action} a={a} />)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
