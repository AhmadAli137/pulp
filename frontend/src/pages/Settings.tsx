import { useEffect, useState } from 'react'
import { api, type Health } from '../services/api'
import { useApp } from '../stores/useApp'
import { Card, Chip, KV } from '../components/ui'

export default function Settings() {
  const { accountId, accessible, setAccessible, refreshContext, clearAccount } = useApp()
  const [health, setHealth] = useState<Health | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)) }, [])

  const reset = async () => {
    if (!accountId) return
    if (!window.confirm(`Delete all personal context stored for account ${accountId}? Official metrics are unaffected.`)) return
    await api.resetContext(accountId)
    await refreshContext()
    setMsg('Context deleted. The plan now uses defaults.')
  }

  return (
    <div className="grid cols-2">
      <Card title="Connection & availability">
        <KV rows={[
          ['API', health ? <Chip>connected</Chip> : <Chip tone="danger">unreachable</Chip>],
          ['Accounts loaded', health ? health.accounts.toLocaleString() : '—'],
          ['Data folder', health?.data_dir ?? '—'],
          ['AI provider', health ? <Chip tone={health.ai_provider === 'offline' ? 'gray' : ''}>{health.ai_label}{health.ai_model ? ` · ${health.ai_model}` : ''}</Chip> : '—'],
          ['Voice', 'One continuous voice for conversation and planning'],
        ]} />
        <p className="tiny muted" style={{ marginTop: 10 }}>Voice starts only when you choose Talk to Pulp. You can keep typing during the same conversation.</p>
      </Card>
      <Card title="Accessibility">
        <label className="row small"><input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} /> Always show results as tables beside charts (no colour needed to read a verdict)</label>
        <p className="tiny muted" style={{ marginTop: 8 }}>Verdicts also carry a text mark (✓, !, =) and a sentence, and every chart has a data table when this is on.</p>
      </Card>
      <Card title="Your data">
        <p className="small">Pulp keeps your conversation and the personal details you confirm for this demo account. Review or remove individual details in Your financial picture, or clear your saved context here.</p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn danger" onClick={reset} disabled={!accountId}>Delete personal context</button>
          <button className="btn" onClick={clearAccount} disabled={!accountId}>Unload account</button>
          <button className="btn" onClick={() => { try { sessionStorage.removeItem('pulp-intro-seen') } catch { /* ignore */ } window.location.href = '/' }}>Replay intro</button>
        </div>
        {msg && <p className="callout green" style={{ marginTop: 10 }}>{msg}</p>}
      </Card>
      <Card title="About the data and the numbers" soft>
        <p className="small">Observed records: PKDD'99 Discovery Challenge Financial dataset (anonymized bank data) via the Tangerine track, CTU Prague Relational Dataset Repository. Amounts are in Canadian dollars per the event README. Official metrics follow the event definitions exactly. Simulated futures and strategy scores are model outputs for scenarios you choose; they are not forecasts and not real-world probabilities. PULP never moves money, applies for products or trades.</p>
      </Card>
    </div>
  )
}
