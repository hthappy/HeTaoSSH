import './monacoConfig'; // Must be first
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import DetachedTerminalApp from './DetachedTerminalApp.tsx'
import { readDetachedTerminalPayload } from './lib/detachedTerminal.ts'
import './index.css'
import './i18n'

const detachedToken = new URLSearchParams(window.location.search).get('detachedTerminal')
const detachedPayload = detachedToken ? readDetachedTerminalPayload(detachedToken) : null

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {detachedToken ? <DetachedTerminalApp payload={detachedPayload} /> : <App />}
  </React.StrictMode>,
)
