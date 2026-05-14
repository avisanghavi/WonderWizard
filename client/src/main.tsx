import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './App.css';
import './parent.css';
import { supabase } from './supabase';

// ---------- Global fetch interceptor ----------
//
// Every same-origin /api/* request gets the current Supabase access token
// attached as a Bearer header. This means individual call sites don't have
// to remember to authenticate — and the entire API can be gated by
// requireParentAuth on the server without breaking anything.
//
// We deliberately do NOT touch external URLs (e.g. Supabase's own HTTPS
// endpoints, image CDNs) — only relative /api paths.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith('/api') || url.startsWith(window.location.origin + '/api')) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init = { ...(init ?? {}), headers };
    }
  }
  return originalFetch(input as RequestInfo, init);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
