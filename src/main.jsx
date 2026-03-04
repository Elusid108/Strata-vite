import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { StrataProvider } from './contexts/StrataContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StrataProvider>
      <App />
    </StrataProvider>
  </StrictMode>,
)
