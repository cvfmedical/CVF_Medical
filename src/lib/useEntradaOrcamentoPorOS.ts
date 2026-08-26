import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

export interface OrcamentoResumoPorOS {
  id: number;
  numero: string;
  status: string;
}

// Código da entrada e orçamento "vigente" de cada OS - usado nas colunas
// Entrada/Orçamento (padrão sitewide: número = link clicável) em toda
// tela que lista OS mas só guarda ordem_servico_id, não os dois números
// prontos. Mesmas chaves de query já usadas em Ordem de serviço/
// Precificar orçamentos, então o cache é compartilhado entre as telas.
//
// Com orçamentos alternativos (ORC-XXXX/2, /3...), "vigente" prioriza o
// Aprovado quando existe; sem nenhum aprovado, cai no mais recente
// (aguardando decisão do cliente).
export function useEntradaOrcamentoPorOS() {
  const entradasQuery = useQuery({
    queryKey: ['entradas-codigo-por-os'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entradas_equipamento')
        .select('ordem_servico_id, codigo_entrada')
        .not('ordem_servico_id', 'is', null);
      if (error) throw error;
      return data as { ordem_servico_id: number; codigo_entrada: string }[];
    },
  });
  const codigoEntradaPorOS = new Map<number, string>();
  (entradasQuery.data ?? []).forEach((e) => codigoEntradaPorOS.set(e.ordem_servico_id, e.codigo_entrada));

  const orcamentosQuery = useQuery({
    queryKey: ['orcamentos-numero-por-os'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('id, ordem_servico_id, numero_orcamento, status')
        .order('id', { ascending: false });
      if (error) throw error;
      return data as { id: number; ordem_servico_id: number; numero_orcamento: string; status: string }[];
    },
  });
  const orcamentoPorOS = new Map<number, OrcamentoResumoPorOS>();
  (orcamentosQuery.data ?? []).forEach((o) => {
    const atual = orcamentoPorOS.get(o.ordem_servico_id);
    if (!atual || o.status === 'Aprovado') {
      orcamentoPorOS.set(o.ordem_servico_id, { id: o.id, numero: o.numero_orcamento, status: o.status });
    }
  });

  return {
    codigoEntradaPorOS,
    orcamentoPorOS,
    isLoading: entradasQuery.isLoading || orcamentosQuery.isLoading,
  };
}
