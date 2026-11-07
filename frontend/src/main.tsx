import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './home.css'
import App from './App'
import Intro, { introSeen } from './components/Intro'

function Root() {
  const [intro, setIntro] = useState(() => !introSeen())
  return intro ? <Intro onDone={() => setIntro(false)} /> : <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
