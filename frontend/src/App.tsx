import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { HarvestIntro, introSeen, markIntroSeen } from './components/PulpMascot'
import Stage from './pages/Stage'
import ShockLab from './pages/ShockLab'
import Twin from './pages/Twin'
import Explore from './pages/Explore'
import Goals from './pages/Goals'
import Roadmap from './pages/Roadmap'
import Insights from './pages/Insights'
import Settings from './pages/Settings'

function Home() {
  const [intro, setIntro] = useState(() => !introSeen())
  const finish = () => { markIntroSeen(); setIntro(false) }
  return (
    <>
      <div inert={intro}><Stage onReplayIntro={() => setIntro(true)} /></div>
      {intro && <HarvestIntro onDone={finish} />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Home />} />
        <Route path="classic" element={<Navigate to="/" replace />} />
        <Route element={<Layout />}>
          <Route path="shock" element={<ShockLab />} />
          <Route path="twin" element={<Twin />} />
          <Route path="explore" element={<Explore />} />
          <Route path="goals" element={<Goals />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="insights" element={<Insights />} />
          <Route path="companion" element={<Navigate to="/" replace />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
