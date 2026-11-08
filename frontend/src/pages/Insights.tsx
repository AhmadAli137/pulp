import { Link } from 'react-router-dom'
import ProfileInsights from '../components/ProfileInsights'

export default function Insights() {
  return <div className="stack"><ProfileInsights /><details className="financial-section"><summary>Why test a scenario instead of judging by cash alone?</summary><p>In the original research, 78 of 2,238 pairs with similar inflows saw the account with more cash run out first under the same modeled six-month layoff at 55% retained income. The size of the monthly shortfall matters alongside the buffer.</p><p>These are simulated outcomes from historical records, not observed layoffs or proof that a particular spending cut is feasible for you.</p></details><section className="financial-section"><h2>What would change your decision?</h2><p>Test a specific change against your own account, then review the preparation and backup plans. Population patterns provide context; they do not determine what you can afford.</p><Link to="/shock">Compare a scenario</Link><p><Link to="/settings">Data sources and limitations</Link></p></section></div>
}
