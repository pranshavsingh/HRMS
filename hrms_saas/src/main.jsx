import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PopupProvider } from './context/PopupContext.jsx'
import { RealtimeProvider } from './context/RealtimeContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PopupProvider>
      <RealtimeProvider>
        <App />
      </RealtimeProvider>
    </PopupProvider>
  </StrictMode>,
)
