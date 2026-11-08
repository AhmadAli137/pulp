import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Card, Chip, ErrorBox, KV } from '../components/ui'
import { api, type Health } from '../services/api'
import { useApp } from '../stores/useApp'

export default function Settings() {
  const replayIntro = useOutletContext<() => void>()
  const { accountId, accessible, setAccessible, refreshContext } = useApp()
  const [health, setHealth] = useState<Health | null | undefined>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    let active = true
    api.health().then((result) => { if (active) setHealth(result) }).catch(() => { if (active) setHealth(null) })
    return () => { active = false }
  }, [])

  const reset = async () => {
    if (!accountId || !window.confirm(`Delete all personal details saved for demo account ${accountId}?`)) return
    setResetting(true)
    setError(null)
    setMessage('')
    try {
      await api.resetContext(accountId)
      await refreshContext()
      setMessage('Saved personal details cleared. Historical account records are still available.')
    } catch {
      setError('Could not clear saved details. Try again.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="grid cols-2">
      <Card title="Display preferences">
        <label className="row small"><input type="checkbox" checked={accessible} onChange={(event) => setAccessible(event.target.checked)} /> Open exact-amount tables by default</label>
        <p className="small muted">Motion follows your device’s accessibility setting.</p>
        <p><button className="btn" type="button" onClick={replayIntro}>Replay intro</button></p>
      </Card>
      <Card title="Data and availability">
        <KV rows={[
          ['Connection', health ? <Chip>Connected</Chip> : health === null ? <Chip tone="danger">Unavailable</Chip> : 'Checking…'],
          ['Demo accounts', health ? health.accounts.toLocaleString() : '—'],
        ]} />
        <p className="small muted">The demo uses historical, anonymized banking records supplied by the Tangerine track. Amounts are in Canadian dollars. Scenario results depend on the inputs you select.</p>
      </Card>
      <Card title="Saved demo details">
        <p className="small">Details you confirm stay with this demo account. You can clear them here. Use Sign out of demo to end the current session.</p>
        <p><button className="btn danger" type="button" onClick={() => void reset()} disabled={!accountId || resetting}>Clear saved details</button></p>
        {message && <p className="small" role="status">{message}</p>}
        <ErrorBox msg={error} />
      </Card>
    </div>
  )
}
