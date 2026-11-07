import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import ShockLab from './pages/ShockLab'
import Twin from './pages/Twin'
import Explore from './pages/Explore'
import Goals from './pages/Goals'
import Roadmap from './pages/Roadmap'
import Insights from './pages/Insights'
import Companion from './pages/Companion'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shock" element={<ShockLab />} />
          <Route path="twin" element={<Twin />} />
          <Route path="explore" element={<Explore />} />
          <Route path="goals" element={<Goals />} />
          <Route path="roadmap" element={<Roadmap />} />
          <Route path="insights" element={<Insights />} />
          <Route path="companion" element={<Companion />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
