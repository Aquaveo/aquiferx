
import React from 'react';
import ReactDOM from 'react-dom/client';
// MUST be imported BEFORE './auth'. The recovery-url snapshot captures
// window.location.hash at module-load BEFORE Supabase JS's _initialize()
// (triggered by './auth') consumes the access_token from the URL. Import
// order is the load-bearing mechanism — do not reorder.
import './recovery-url-snapshot';
import { SupabaseProvider, AuthProvider } from '@aquaveo/geoglows-auth/react';
import { auth, supabase } from './auth';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <SupabaseProvider client={supabase}>
      <AuthProvider auth={auth}>
        <App />
      </AuthProvider>
    </SupabaseProvider>
  </React.StrictMode>
);
