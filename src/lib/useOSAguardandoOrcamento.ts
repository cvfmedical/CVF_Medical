import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { STATUS_TRIAGEM, STATUS_AGUARDANDO_ORCAMENTO } from './statusOS';

// Extraído de OrcamentoTecnico.tsx - compartilhado entre o seletor de
// OS da tela e o alerta flutuante (AlertaOSAguardandoOrcamento), mesma
// queryKey então os dois usam o mesmo cache do React Query.
export interface OSParaOrcamentoTecnico {
  id: number;
  numero_os: string;
  cliente_nome: string;
  status_os: string;
}

export function useOSAguardandoOrcamento(enabled = true) {
  return useQuery({
    queryKey: ['ordens-servico-para-orcamento-tecnico'],
    refetchInterval: 60_000,
    enabled,
    queryFn: async (): Promise<OSParaOrcamentoTecnico[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, cliente_nome, status_os')
        .in('status_os', [STATUS_TRIAGEM, STATUS_AGUARDANDO_ORCAMENTO])
        .order('data_abertura', { ascending: false });
      if (error) throw error;
      return data as OSParaOrcamentoTecnico[];
    },
  });
}
