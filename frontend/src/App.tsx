import { lazy, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { HarvestIntro, introSeen, markIntroSeen } from './components/PulpMascot'
import Overview from './pages/Overview'

const ShockLab = lazy(() => import('./pages/ShockLab'))
const Plan = lazy(() => import('./pages/Plan'))
const Twin = lazy(() => import('./pages/Twin'))
const Goals = lazy(() => import('./pages/Goals'))
const Roadmap = lazy(() => import('./pages/Roadmap'))
const Insights = lazy(() => import('./pages/Insights'))
const Settings = lazy(() => import('./pages/Settings'))
const Briefings = lazy(() => import('./pages/Briefings'))

function OpeningWorkspace() {
  const { pathname } = useLocation()
  const [intro, setIntro] = useState(() => pathname === '/' && !introSeen())
  const finish = () => { markIntroSeen(); setIntro(false) }
  return (
    <>
      <div inert={intro}><Layout onReplayIntro={() => setIntro(true)} /></div>
      {intro && <HarvestIntro onDone={finish} />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="classic" element={<Navigate to="/" replace />} />
        <Route path="companion" element={<Navigate to="/" replace />} />
        <Route path="explore" element={<Navigate to="/shock" replace />} />
        <Route element={<OpeningWorkspace />}>
          <Route index element={<Overview />} />
          <Route path="shock" element={<ShockLab />} />
          <Route path="plan" element={<Plan />} />
          <Route path="briefings" element={<Briefings />} />
          <Route path="twin" element={<Twin />} />
          <Route path="goals" element={<Goals />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="insights" element={<Insights />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
