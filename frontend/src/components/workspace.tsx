import { ArrowUpRight, MessageCircle, Activity, Fingerprint, GitBranch, Target, Map, ChartNoAxesCombined, Settings } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

export const WORKSPACE = [
  { to: '/', label: 'Planning room', icon: MessageCircle, subtitle: 'Talk through a decision. Put the numbers in perspective.', next: '/shock', task: 'Understand your starting point, then test a setback' },
  { to: '/shock', label: 'Prepare for a setback', icon: Activity, subtitle: 'See what a change in income or an unexpected expense would mean.', next: '/goals', task: 'Choose a change, then review its effect' },
  { to: '/twin', label: 'Your financial picture', icon: Fingerprint, subtitle: 'What the records show, alongside the life only you can describe.', next: '/insights', task: 'Review your records and personal details' },
  { to: '/insights', label: 'Insights & evidence', icon: ChartNoAxesCombined, subtitle: 'Understand a pattern, its effect on your life, and what to ask next.', next: '/explore', task: 'Find the question that changes your decision' },
  { to: '/explore', label: 'Compare possibilities', icon: GitBranch, subtitle: 'Try a different cost, timing or commitment before choosing a direction.', next: '/goals', task: 'Adjust an assumption and compare the outcomes' },
  { to: '/goals', label: 'Goals & choices', icon: Target, subtitle: 'Connect what you want with the time, money and flexibility it needs.', next: '/roadmap', task: 'Set a goal and review the choices around it' },
  { to: '/roadmap', label: 'Your next steps', icon: Map, subtitle: 'A considered sequence of actions, with the trade-offs kept in view.', next: '/', task: 'Choose one next step you can actually take' },
  { to: '/briefings', label: 'Briefings & summaries', icon: Activity, subtitle: 'A daily focus and a weekly review of your saved financial picture.', next: '/twin', task: 'Review what changed and choose your next conversation' },
  { to: '/settings', label: 'Preferences & data', icon: Settings, subtitle: 'Control your experience and understand the information behind it.', next: '/twin', task: 'Manage your preferences and saved details' },
]

export function WorkspaceNav() {
  return <nav className="workspace-tabs" aria-label="Planning workspace">{WORKSPACE.filter(x => x.to !== '/settings').map(x => <NavLink key={x.to} to={x.to} end={x.to === '/'}>{x.label}</NavLink>)}</nav>
}

export function PageGuide({ path }: { path: string }) {
  const page = WORKSPACE.find(x => x.to === path)
  const next = WORKSPACE.find(x => x.to === page?.next)
  if (!page || !next) return null
  return <div className="page-guide"><div><span className="editorial-label">Make this useful</span><p>{page.task}</p></div><Link to={next.to}>{next.label}<ArrowUpRight size={16}/></Link><Link className="guide-conversation" to={`/?prompt=${encodeURIComponent(`Help me understand ${page.label.toLowerCase()} and choose my next step.`)}`}>Talk it through<ArrowUpRight size={16}/></Link></div>
}
