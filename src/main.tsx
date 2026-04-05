import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import '@fontsource/manrope/400.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/700.css'
import '@fontsource/orbitron/500.css'
import '@fontsource/orbitron/700.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import '@solana/wallet-adapter-react-ui/styles.css'
import './index.css'
import App from './App'
import { AppProviders } from './solana/AppProviders'

const browserGlobals = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer
}

if (!browserGlobals.Buffer) {
  browserGlobals.Buffer = Buffer
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
