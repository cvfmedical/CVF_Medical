import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados (.env.local)');
}

// Nunca usar a chave service_role aqui - só a publica (anon/publishable),
// segura para expor no navegador. Mesma classe de chave ja usada em
// portal_cliente/index.html.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
