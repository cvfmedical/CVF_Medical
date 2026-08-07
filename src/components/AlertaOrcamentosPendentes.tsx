import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { AlertaCard } from './AlertaCard';
import { useAlertaDismissivel } from '../lib/useAlertaDismissivel';

// Contagem de orçamentos aguardando precificação/envio - só aparece
// para quem tem permissão financeira, some quando a fila está vazia.
// Renderizado dentro da pilha AlertasFlutuantes (canto inferior direito).
export function AlertaOrcamentosPendentes() {
  const { temPermissao } = useAuth();
  const navigate = useNavigate();
  const podeVer = temPermissao('financeiro');
  const { oculto, fechar } = useAlertaDismissivel();

  const query = useQuery({
    queryKey: ['contagem-orcamentos-pendentes'],
    enabled: podeVer,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('orcamentos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Aguardando Precificação');
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (!podeVer || !query.data || oculto) return null;

  return (
    <AlertaCard
      count={query.data}
      descricao={`orçamento${query.data > 1 ? 's' : ''} aguardando precificação`}
      onClick={() => navigate('/orcamento-financeiro')}
      onClose={fechar}
    />
  );
}
