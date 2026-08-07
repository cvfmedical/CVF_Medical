import { supabase } from './supabaseClient';

const INICIO_PADRAO = 5500;

// Gera o próximo código sequencial de um prefixo (ex: ENT-5500, OS-5501,
// ORC-5502). Cada prefixo tem sua própria sequência começando em 5500.
// Códigos no formato antigo (com data, ex: ENT-20260806-003) são
// ignorados - só entram na conta os que têm sufixo puramente numérico.
export async function gerarNumeroSequencial(
  prefixo: string,
  tabela: string,
  coluna: string,
  inicio = INICIO_PADRAO,
): Promise<string> {
  const { data, error } = await supabase.from(tabela).select(coluna).like(coluna, `${prefixo}-%`);
  if (error) throw error;

  let maior = inicio - 1;
  for (const row of (data ?? []) as unknown as Record<string, string>[]) {
    const valor = row[coluna];
    if (!valor) continue;
    const sufixo = valor.slice(prefixo.length + 1); // depois de "PREFIXO-"
    if (/^\d+$/.test(sufixo)) {
      const n = parseInt(sufixo, 10);
      if (n > maior) maior = n;
    }
  }
  return `${prefixo}-${maior + 1}`;
}
