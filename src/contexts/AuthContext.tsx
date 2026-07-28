import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { Categoria } from '../lib/permissions';
import { temPermissao } from '../lib/permissions';

interface Funcionario {
  id: number;
  nome: string;
  cargo: string | null;
  nivel_acesso: string;
}

interface AuthContextValue {
  session: Session | null;
  funcionario: Funcionario | null;
  loading: boolean;
  erro: string | null;
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  temPermissao: (categoria: Categoria) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function buscarFuncionario(authUserId: string): Promise<Funcionario | null> {
  // A policy staff_ve_funcionarios (007_staff_rls_policies.sql) permite
  // que qualquer staff veja o diretório inteiro (não só a própria linha)
  // - por isso o filtro por auth_user_id é obrigatório aqui, senão
  // .single() falha assim que houver mais de um funcionário cadastrado.
  const { data, error } = await supabase
    .from('funcionarios')
    .select('id, nome, cargo, nivel_acesso')
    .eq('auth_user_id', authUserId)
    .single();

  if (error || !data) return null;
  return data as Funcionario;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!ativo) return;
      setSession(session);
      if (session) {
        const f = await buscarFuncionario(session.user.id);
        if (ativo) setFuncionario(f);
      }
      if (ativo) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!ativo) return;
      setSession(session);
      if (session) {
        const f = await buscarFuncionario(session.user.id);
        if (ativo) setFuncionario(f);
      } else {
        setFuncionario(null);
      }
    });

    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, senha: string) {
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      const msg = 'E-mail ou senha incorretos.';
      setErro(msg);
      return { error: msg };
    }
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const value: AuthContextValue = {
    session,
    funcionario,
    loading,
    erro,
    signIn,
    signOut,
    temPermissao: (categoria: Categoria) => temPermissao(funcionario?.nivel_acesso, categoria),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
