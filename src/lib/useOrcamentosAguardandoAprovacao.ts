import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

// Orçamentos já enviados ao cliente mas que ele ainda não respondeu
// (nem aprovou, nem recusou) - útil pra saber quem cobrar/ligar. Some
// desta lista assim que o cliente decide (orcamentos.status muda pra
// "Aprovado"/"Recusado") ou some se o financeiro reverter a precificação.
export interface OrcamentoAguardandoAprovacao {
  id: number;
  numero_orcamento: string;
  ordem_servico_id: number;
  data_envio: string | null;
  valor_fixo_contrato: number | null;
  desconto: number | null;
  bonificacao: boolean | null;
  ordens_servico: {
    numero_os: string;
    cliente_nome: string;
    optica_desc: string | null;
    optica_fab: string | null;
    optica_sn: string | null;
  } | null;
  orcamento_itens: { quantidade: number; preco_unitario: number | null }[];
}

export function useOrcamentosAguardandoAprovacao(enabled = true) {
  return useQuery({
    queryKey: ['orcamentos-aguardando-aprovacao'],
    refetchInterval: 30_000,
    enabled,
    queryFn: async (): Promise<OrcamentoAguardandoAprovacao[]> => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select(
          'id, numero_orcamento, ordem_servico_id, data_envio, valor_fixo_contrato, desconto, bonificacao, ordens_servico(numero_os, cliente_nome, optica_desc, optica_fab, optica_sn), orcamento_itens(quantidade, preco_unitario)',
        )
        .eq('status', 'Enviado ao Cliente')
        .order('data_envio', { ascending: true });
      if (error) throw error;
      return data as unknown as OrcamentoAguardandoAprovacao[];
    },
  });
}
