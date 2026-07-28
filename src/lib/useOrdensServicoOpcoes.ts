import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

export interface OrdemServicoResumo {
  id: number;
  numero_os: string;
  cliente_nome: string;
  status_os: string | null;
}

// Lista de OS pra popular selects (Manutenção, Selagem, Estanqueidade,
// Autoclave, Entrega, Laudos) - todas essas telas referenciam uma OS já
// aberta, não criam OS nova.
export function useOrdensServicoOpcoes() {
  const query = useQuery({
    queryKey: ['ordens-servico-opcoes'],
    queryFn: async (): Promise<OrdemServicoResumo[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, cliente_nome, status_os')
        .order('data_abertura', { ascending: false });
      if (error) throw error;
      return data as OrdemServicoResumo[];
    },
  });

  const opcoes = (query.data ?? []).map((os) => ({
    value: String(os.id),
    label: `${os.numero_os} - ${os.cliente_nome}`,
  }));

  const porId = (id: number) => query.data?.find((os) => os.id === id);

  return { ...query, opcoes, porId };
}
