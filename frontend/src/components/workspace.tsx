import { Activity, ArrowRight, BookOpen, Clapperboard, ChartNoAxesCombined, FileText, Fingerprint, LayoutDashboard, Map, Network, Settings, Target, UserRound } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import './agents/nav.css'

/* The four main tabs: one question each, which is the page's h1 (the tab name sits above it as a small eyebrow) and
   is answered by one sentence at the top of the page. Everything else is reached from inside a tab, from the persona name in the
   header (Profile) or from the "How it works" footer, so no page is listed twice. */
export const PRIMARY_WORKSPACE = [
  { to: '/', label: 'Overview', question: 'How am I doing?', icon: LayoutDashboard, subtitle: 'See what usually comes in, what goes out, and what the account has available.' },
  { to: '/shock', label: 'Shocks', question: 'What if life happens?', icon: Activity, subtitle: 'See how an income change or unexpected expense could affect your finances.' },
  { to: '/plan', label: 'My Plan', question: 'What should I do?', icon: Target, subtitle: 'Take a step toward your goal and know what to do if a shock hits.' },
  { to: '/insights', label: 'Insights', question: 'How do I compare?', icon: ChartNoAxesCombined, subtitle: 'Explore patterns in the records and what they might mean for your account.' },
]

/* Pages that belong to a tab or to the person: linked from Profile, My Plan and Insights, not from the menu. */
export const ACCOUNT_PAGES = [
  { to: '/profile', label: 'Profile', icon: UserRound, subtitle: 'The life behind the numbers: goals, worries and how PULP’s picture of you has changed.' },
  { to: '/twin', label: 'Account details', icon: Fingerprint, subtitle: 'Review the account’s records and add details that matter to your plans.' },
  { to: '/goals', label: 'Goals', icon: Target, subtitle: 'Compare ways to reach a goal using your timeline and budget.' },
  { to: '/roadmap', label: 'Next steps', icon: Map, subtitle: 'See what you could do this week, this month, and this year.' },
  { to: '/briefings', label: 'Briefings', icon: Activity, subtitle: 'Review your saved financial picture.' },
]

/* The site footer's "How it works" links. */
export const HOW_IT_WORKS = [
  { to: '/tour', label: 'Watch PULP work', icon: Clapperboard, subtitle: 'A guided, skippable walk through what every agent did for this account: records to a person, how the profile changes, and how a shock becomes four plans.' },
  { to: '/agents', label: 'Agents', icon: Network, subtitle: 'Watch every agent work: what each one reads, decides and hands on, across all three stages.' },
  { to: '/report', label: 'Stage 1 report', icon: FileText, subtitle: 'Everything PULP learned from the records, in plain words and in technical detail.' },
  { to: '/developers', label: 'Developer docs', icon: BookOpen, subtitle: 'The API, the agents and how they hand work to each other, the stack and the infrastructure.' },
  { to: '/settings', label: 'Settings', icon: Settings, subtitle: 'Manage your preferences and see where the data comes from.' },
]

export const WORKSPACE = [...PRIMARY_WORKSPACE, ...ACCOUNT_PAGES, ...HOW_IT_WORKS]

/* Where each folded page lives, so the user keeps their bearings: its tab stays highlighted (or, for account details,
   the persona link) and the page shows a back link above its title. */
const PARENT_OF: Record<string, string> = { '/roadmap': '/plan', '/goals': '/plan', '/briefings': '/insights', '/twin': '/profile' }

export function parentPage(pathname: string) {
  const to = PARENT_OF[pathname]
  return to ? WORKSPACE.find((page) => page.to === to) ?? null : null
}

export function WorkspaceNav() {
  const parent = parentPage(useLocation().pathname)?.to
  return (
    <nav className="workspace-tabs" aria-label="Main navigation">
      {PRIMARY_WORKSPACE.map(({ to, label, icon: Icon }) => to === parent
        ? <Link key={to} to={to} className="is-parent" aria-current="true"><Icon size={17} aria-hidden="true" />{label}</Link>
        : <NavLink key={to} to={to} end={to === '/'}><Icon size={17} aria-hidden="true" />{label}</NavLink>)}
    </nav>
  )
}

/* For judges and developers: a quiet link at the far end of the tab bar, set apart from the four customer tabs. It opens
   the guided tour and stays lit on every "how it works" page (tour, Agents, Stage 1 report, Developer docs). */
const BEHIND_THE_SCENES = ['/tour', '/agents', '/report', '/developers']

export function BehindTheScenesLink() {
  const on = BEHIND_THE_SCENES.includes(useLocation().pathname)
  return (
    <nav className="behind-scenes" aria-label="Behind the scenes">
      <Link to="/tour" className={on ? 'is-on' : undefined} aria-current={on ? 'page' : undefined}
        title="A guided tour of the agents at work, then the agent runs, the Stage 1 report and the developer docs">
        <Network size={15} aria-hidden="true" />Behind the scenes<ArrowRight size={13} aria-hidden="true" />
      </Link>
    </nav>
  )
}

/* A short row of places to go from inside a tab, drawn with an arrow. In-content links, not a navigation landmark. */
export function MoreLinks({ links, className = '' }: { links: { to: string; text: string }[]; className?: string }) {
  return (
    <div className={`link-row link-row-go${className ? ` ${className}` : ''}`}>
      {links.map(({ to, text }) => <Link key={to} to={to}>{text}<ArrowRight size={14} aria-hidden="true" /></Link>)}
    </div>
  )
}

export function HowItWorksFooter() {
  return (
    <footer className="site-footer">
      <div className="bank-width site-footer-inner">
        <nav aria-label="How it works" className="site-footer-nav">
          <h2>How it works</h2>
          <ul>
            {HOW_IT_WORKS.map(({ to, label }) => <li key={to}><NavLink to={to}>{label}</NavLink></li>)}
          </ul>
        </nav>
        <p className="site-footer-note">Fictional people built from anonymized demo records.</p>
      </div>
    </footer>
  )
}
