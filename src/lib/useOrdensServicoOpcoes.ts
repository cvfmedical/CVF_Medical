import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

export interface OrdemServicoResumo {
  id: number;
  numero_os: string;
  cliente_nome: string;
  status_os: string | null;
  cliente_id: number;
  optica_desc: string | null;
  optica_fab: string | null;
  catalogo_otica_id: number | null;
  etiqueta_despacho_impressa_em: string | null;
}

// Lista de OS pra popular selects (Manutenção, Estanqueidade, Autoclave,
// Teste de Qualidade, Entrega, Laudos) - todas essas telas referenciam uma
// OS já aberta, não criam OS nova.
//
// statusPermitidos filtra as opções pelo status_os certo daquela etapa
// (mesmo padrão já usado em Entrega.tsx) - sem isso, o dropdown mostrava
// TODAS as OS de qualquer status, inclusive já entregues ou ainda em
// triagem, o que não fazia sentido pra uma tela de etapa específica.
export function useOrdensServicoOpcoes(statusPermitidos?: string[]) {
  const query = useQuery({
    queryKey: ['ordens-servico-opcoes'],
    queryFn: async (): Promise<OrdemServicoResumo[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select(
          'id, numero_os, cliente_nome, status_os, cliente_id, optica_desc, optica_fab, catalogo_otica_id, etiqueta_despacho_impressa_em',
        )
        .order('data_abertura', { ascending: false });
      if (error) throw error;
      return data as OrdemServicoResumo[];
    },
  });

  const dados = statusPermitidos
    ? (query.data ?? []).filter((os) => statusPermitidos.includes(os.status_os ?? ''))
    : (query.data ?? []);

  const opcoes = dados.map((os) => ({
    value: String(os.id),
    label: `${os.numero_os} - ${os.cliente_nome}`,
  }));

  const porId = (id: number) => query.data?.find((os) => os.id === id);

  return { ...query, opcoes, porId };
}
