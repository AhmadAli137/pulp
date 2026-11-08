import { useEffect, useState } from 'react'
import { ArrowRight, WalletCards } from 'lucide-react'
import { api, type SampleAccount } from '../services/api'
import { useApp } from '../stores/useApp'

export default function DemoAccountPicker() {
  const { loadingProfile, loadAccount } = useApp()
  const [accounts, setAccounts] = useState<SampleAccount[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    api.samples().then(({ accounts }) => {
      if (active) setAccounts(accounts.slice(0, 6))
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [])

  return (
    <section className="card bank-picker" aria-labelledby="bank-picker-title">
      <div className="bank-icon" aria-hidden="true"><WalletCards size={23} /></div>
      <h2 id="bank-picker-title">Pick an account to begin</h2>
      <p>Use a sample account to explore PULP with anonymized banking records. You can also enter a demo account ID above.</p>
      {(loadingProfile || (!accounts && !failed)) && (
        <p className="bank-loading" role="status"><span aria-hidden="true" />{loadingProfile ? 'Loading account…' : 'Loading sample accounts…'}</p>
      )}
      {(failed || accounts?.length === 0) && (
        <p className="bank-picker-note" role="alert">Sample accounts are unavailable. If you have a demo account ID, enter it above.</p>
      )}
      {!!accounts?.length && (
        <div className="bank-account-options" role="group" aria-label="Sample accounts">
          {accounts.map(({ account_id, months }) => (
            <button className="bank-account-option" type="button" key={account_id} disabled={loadingProfile}
              aria-label={`Account ${account_id}`} onClick={() => void loadAccount(account_id)}>
              <span><strong>Account {account_id}</strong><small>{months} {months === 1 ? 'month' : 'months'} of records</small></span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
