import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados (.env.local)');
}

// Nunca usar a chave service_role aqui - só a publica (anon/publishable),
// segura para expor no navegador. Mesma classe de chave ja usada em
// portal_cliente/index.html.
//
// storage: sessionStorage (em vez do localStorage padrao) faz a sessao
// valer so enquanto a janela/aba fica aberta. Ao fechar o navegador e
// abrir o sistema de novo (ex: pelo favorito), ele pede login outra vez.
// Um simples F5/recarregar na mesma aba mantem o usuario logado.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
