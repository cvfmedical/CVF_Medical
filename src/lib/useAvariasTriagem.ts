import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

// Checklist de avarias da triagem - cadastro editável (Cadastros Gerais >
// Avarias de triagem), com grupo/subgrupo opcional pra filtrar por tipo de
// equipamento. Chave de armazenamento em triagem_avarias (jsonb) é o id
// (como string) - ver migration 064 pro remapeamento dos 5 itens antigos
// (que usavam chaves fixas em texto).
export interface AvariaTriagem {
  id: number;
  descricao: string;
  grupo: string | null;
  subgrupo: string | null;
}

export function useAvariasTriagem() {
  const query = useQuery({
    queryKey: ['avarias-triagem'],
    queryFn: async (): Promise<AvariaTriagem[]> => {
      const { data, error } = await supabase
        .from('avarias_triagem')
        .select('id, descricao, grupo, subgrupo')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as AvariaTriagem[];
    },
  });

  function descricaoPorChave(chave: string): string {
    return query.data?.find((a) => String(a.id) === chave)?.descricao ?? chave;
  }

  return { ...query, descricaoPorChave };
}
