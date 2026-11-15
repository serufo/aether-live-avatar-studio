import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

class StudioErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, errorMsg: String(error) };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: '#090b10',
            color: '#f3f5f8',
            height: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: 'system-ui, sans-serif',
            gap: '12px',
          }}
        >
          <h2>Aether Live Studio — Recuperação Automática</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>{this.state.errorMsg}</p>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('aether_live_studio_state_v1');
              window.location.reload();
            }}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              background: '#00f0ff',
              color: '#050811',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reiniciar Estado do Estúdio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudioErrorBoundary>
      <App />
    </StudioErrorBoundary>
  </StrictMode>
);
