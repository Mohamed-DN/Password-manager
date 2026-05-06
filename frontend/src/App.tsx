import React from 'react';
import { authClient } from './auth-client';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const { data: session, isPending } = authClient.useSession();

  const isAuthenticated = session !== undefined && session !== null;

  if (isPending) {
    return (
      <div className="full-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <Dashboard />;
}
