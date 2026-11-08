import { Activity, BookOpen, ChartNoAxesCombined, FileText, Fingerprint, LayoutDashboard, Map, Network, Settings, Target, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import './agents/nav.css'

export const PRIMARY_WORKSPACE = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, subtitle: 'See what usually comes in, what goes out, and what the account has available.' },
  { to: '/profile', label: 'Profile', icon: UserRound, subtitle: 'The life behind the numbers: goals, worries and how PULP’s picture of you has changed.' },
  { to: '/shock', label: 'Shocks', icon: Activity, subtitle: 'See how an income change or unexpected expense could affect your finances.' },
  { to: '/plan', label: 'My Plan', icon: Target, subtitle: 'Take a step toward your goal and know what to do if a shock hits.' },
  { to: '/insights', label: 'Insights', icon: ChartNoAxesCombined, subtitle: 'Explore patterns in the records and what they might mean for your account.' },
  { to: '/agents', label: 'Agents', icon: Network, subtitle: 'Watch every agent work: what each one reads, decides and hands on, across all three stages.' },
]

export const SUPPORTING_WORKSPACE = [
  { to: '/twin', label: 'Account details', icon: Fingerprint, subtitle: 'Review the account’s records and add details that matter to your plans.' },
  { to: '/goals', label: 'Goals', icon: Target, subtitle: 'Compare ways to reach a goal using your timeline and budget.' },
  { to: '/roadmap', label: 'Next steps', icon: Map, subtitle: 'See what you could do this week, this month, and this year.' },
  { to: '/briefings', label: 'Briefings', icon: Activity, subtitle: 'Review your saved financial picture.' },
  { to: '/report', label: 'Stage 1 report', icon: FileText, subtitle: 'Everything PULP learned from the records, in plain words and in technical detail.' },
  { to: '/developers', label: 'Developer docs', icon: BookOpen, subtitle: 'The API, the agents and how they hand work to each other, the stack and the infrastructure.' },
  { to: '/settings', label: 'Settings', icon: Settings, subtitle: 'Manage your preferences and see where the data comes from.' },
]

export const WORKSPACE = [...PRIMARY_WORKSPACE, ...SUPPORTING_WORKSPACE]

export function WorkspaceNav() {
  return (
    <nav className="workspace-tabs" aria-label="Main navigation">
      {PRIMARY_WORKSPACE.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'}><Icon size={17} aria-hidden="true" />{label}</NavLink>
      ))}
    </nav>
  )
}
