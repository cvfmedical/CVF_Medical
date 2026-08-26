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

// Sufixo numérico puro de um código prefixado (ex.: "OS-5570" -> "5570",
// "ORC-5561/2" -> "5561" - ignora sufixo de orçamento alternativo). Usado
// pra PROPAGAR o mesmo número de Entrada -> OS -> Orçamento, em vez de
// cada tabela ter sua própria contagem independente.
export function sufixoNumerico(valorPrefixado: string): string {
  return valorPrefixado.split('-').slice(1).join('-').split('/')[0];
}

// Igual gerarNumeroSequencial, mas olhando o maior sufixo numérico em
// VÁRIAS tabelas/prefixos ao mesmo tempo - usado só na hora de mintar um
// número novo "do zero" (Entrada nova, ou OS aberta direto sem Entrada),
// pra garantir que Entrada/OS/Orçamento nunca colidam nem fiquem
// dessincronizados entre si (o mesmo trabalho deve ter o mesmo número em
// todo o fluxo, só trocando o prefixo).
export async function proximoNumeroCompartilhado(
  fontes: { prefixo: string; tabela: string; coluna: string }[],
  inicio = INICIO_PADRAO,
): Promise<number> {
  let maior = inicio - 1;
  for (const fonte of fontes) {
    const { data, error } = await supabase.from(fonte.tabela).select(fonte.coluna).like(fonte.coluna, `${fonte.prefixo}-%`);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as Record<string, string>[]) {
      const valor = row[fonte.coluna];
      if (!valor) continue;
      const sufixo = sufixoNumerico(valor);
      if (/^\d+$/.test(sufixo)) {
        const n = parseInt(sufixo, 10);
        if (n > maior) maior = n;
      }
    }
  }
  return maior + 1;
}

// As 3 fontes que precisam ficar em sincronia - qualquer número novo
// "do zero" (Entrada, ou OS aberta sem Entrada) precisa checar as 3.
const FONTES_NUMERACAO_COMPARTILHADA = [
  { prefixo: 'ENT', tabela: 'entradas_equipamento', coluna: 'codigo_entrada' },
  { prefixo: 'OS', tabela: 'ordens_servico', coluna: 'numero_os' },
  { prefixo: 'ORC', tabela: 'orcamentos', coluna: 'numero_orcamento' },
];

export async function proximoNumeroDeJob(): Promise<number> {
  return proximoNumeroCompartilhado(FONTES_NUMERACAO_COMPARTILHADA);
}
