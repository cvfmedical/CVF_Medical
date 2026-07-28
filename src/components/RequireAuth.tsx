import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CarregandoTela } from './CarregandoTela';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <CarregandoTela />;
  if (!session) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
