import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

// Hook genérico de CRUD via supabase-js/PostgREST, usado pelas telas de
// cadastro simples (Fase A). Cada tela's espera Row com pelo menos {id}.
export function useCrud<Row extends { id: number }>(tabela: string, ordenarPor = 'id') {
  const qc = useQueryClient();
  const queryKey = [tabela];

  const listQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from(tabela)
        .select('*')
        .order(ordenarPor, { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const criar = useMutation({
    mutationFn: async (novo: Partial<Row>) => {
      // supabase-js sem tipos gerados do schema infere o insert de forma
      // estrita demais para um Partial<Row> genérico - cast necessário.
      const { error } = await supabase.from(tabela).insert(novo as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, dados }: { id: number; dados: Partial<Row> }) => {
      const { error } = await supabase.from(tabela).update(dados as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const excluir = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { listQuery, criar, atualizar, excluir };
}
