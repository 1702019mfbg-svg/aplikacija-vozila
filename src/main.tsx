import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import './styles.css'
import App from './App'
import { setApi } from './lib/api'
import { isConfigured } from './lib/config'
import { initTheme } from './lib/theme'

async function boot() {
  initTheme()
  if (__DEMO__) {
    // probna verzija sa podacima u memoriji (VITE_DEMO=1); u produkcionom build-u ove grane nema
    const { createDemoApi } = await import('./lib/demoApi')
    setApi(createDemoApi())
  } else if (isConfigured) {
    const { createSupabaseApi } = await import('./lib/supabaseApi')
    setApi(createSupabaseApi())
  }
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
