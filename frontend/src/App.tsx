import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { HarvestIntro, introSeen, markIntroSeen } from './components/PulpMascot'

// Load the page a customer opens, rather than shipping every chart and simulator at once.
const AgentHome = lazy(() => import('./pages/AgentHome'))
const ShockLab = lazy(() => import('./pages/ShockLab'))
const Twin = lazy(() => import('./pages/Twin'))
const Explore = lazy(() => import('./pages/Explore'))
const Goals = lazy(() => import('./pages/Goals'))
const Roadmap = lazy(() => import('./pages/Roadmap'))
const Insights = lazy(() => import('./pages/Insights'))
const Companion = lazy(() => import('./pages/Companion'))
const Settings = lazy(() => import('./pages/Settings'))

function Home() {
  const [intro, setIntro] = useState(() => !introSeen())
  const finish = () => { markIntroSeen(); setIntro(false) }
  return (
    <>
      <div inert={intro}><AgentHome onReplayIntro={() => setIntro(true)} /></div>
      {intro && <HarvestIntro onDone={finish} />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="page-loading" role="status">Loading your workspace…</div>}>
        <Routes>
          <Route index element={<Home />} />
          <Route element={<Layout />}>
            <Route path="shock" element={<ShockLab />} />
            <Route path="twin" element={<Twin />} />
            <Route path="explore" element={<Explore />} />
            <Route path="goals" element={<Goals />} />
            <Route path="roadmap" element={<Roadmap />} />
            <Route path="insights" element={<Insights />} />
            <Route path="companion" element={<Companion />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
