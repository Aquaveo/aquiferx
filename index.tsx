
import React from 'react';
import ReactDOM from 'react-dom/client';
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
