import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { STATUS_VOLTA_MANUTENCAO } from './statusOS';

// Compartilhado entre a tela "Orçamentos aprovados" e o alerta
// flutuante correspondente. orcamentos.status nunca muda depois de
// "Aprovado" - por isso filtrar só por isso contaria TODO orçamento já
// aprovado, mesmo os já entregues há semanas. O que realmente indica
// "ainda esperando manutenção" é a OS estar parada em
// '4. EM MANUTENÇÃO' (a manutenção só avança pra frente quando o
// técnico preenche data_fim em Manutencao.tsx).
export interface OrcamentoAprovado {
  id: number;
  numero_orcamento: string;
  ordem_servico_id: number;
  data_resposta_cliente: string | null;
  valor_fixo_contrato: number | null;
  ordens_servico: {
    numero_os: string;
    cliente_nome: string;
    optica_desc: string | null;
    optica_fab: string | null;
    optica_sn: string | null;
    status_os: string | null;
  } | null;
  orcamento_itens: { quantidade: number; preco_unitario: number | null }[];
}

export function useOrcamentosAprovados(enabled = true) {
  return useQuery({
    queryKey: ['orcamentos-aprovados'],
    refetchInterval: 30_000,
    enabled,
    queryFn: async (): Promise<OrcamentoAprovado[]> => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select(
          'id, numero_orcamento, ordem_servico_id, data_resposta_cliente, valor_fixo_contrato, ordens_servico!inner(numero_os, cliente_nome, optica_desc, optica_fab, optica_sn, status_os), orcamento_itens(quantidade, preco_unitario)',
        )
        .eq('status', 'Aprovado')
        .eq('ordens_servico.status_os', STATUS_VOLTA_MANUTENCAO)
        .order('data_resposta_cliente', { ascending: true });
      if (error) throw error;
      return data as unknown as OrcamentoAprovado[];
    },
  });
}
