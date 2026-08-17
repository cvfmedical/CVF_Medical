import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { STATUS_PRONTO_ENTREGA } from './statusOS';

const STATUS_ENTREGUE = '11. ENTREGUE AO CLIENTE';

export interface OrcamentoLiberadoFaturar {
  id: number;
  numero_orcamento: string;
}

// Orçamentos aprovados cuja OS já chegou em "Pronto para entrega"/"Entregue"
// e que ainda não têm NENHUMA conta a receber lançada - desde a migração
// 056, a conta só é criada ao lançar a NF (antes disso não existe nada
// representando "falta faturar"). Compartilhado entre a tela de Faturamento
// e este alerta.
export function useContasLiberadasParaFaturar(enabled = true) {
  return useQuery({
    queryKey: ['contas-liberadas-para-faturar'],
    refetchInterval: 60_000,
    enabled,
    queryFn: async (): Promise<OrcamentoLiberadoFaturar[]> => {
      const { data: orcamentos, error } = await supabase
        .from('orcamentos')
        .select('id, numero_orcamento, ordens_servico!inner(status_os)')
        .eq('status', 'Aprovado')
        .in('ordens_servico.status_os', [STATUS_PRONTO_ENTREGA, STATUS_ENTREGUE]);
      if (error) throw error;

      const ids = (orcamentos ?? []).map((o) => o.id);
      if (ids.length === 0) return [];

      const { data: contas, error: erroContas } = await supabase
        .from('contas_receber')
        .select('orcamento_id')
        .in('orcamento_id', ids);
      if (erroContas) throw erroContas;

      const jaTemConta = new Set((contas ?? []).map((c) => c.orcamento_id));
      return (orcamentos ?? [])
        .filter((o) => !jaTemConta.has(o.id))
        .map((o) => ({ id: o.id, numero_orcamento: o.numero_orcamento }));
    },
  });
}
