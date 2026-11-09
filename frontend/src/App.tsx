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
const Agents = lazy(() => import('./pages/Agents'))
const ProfilePage = lazy(() => import('./pages/Profile'))
const Report = lazy(() => import('./pages/Report'))
const Tour = lazy(() => import('./pages/Tour'))
const Docs = lazy(() => import('./pages/Docs'))

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
          <Route path="agents" element={<Agents />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="report" element={<Report />} />
          <Route path="tour" element={<Tour />} />
          {/* /docs itself is FastAPI's interactive API reference on the single-server build, so the guide lives here. */}
          <Route path="developers" element={<Docs />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
