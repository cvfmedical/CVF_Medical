import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { IconCash } from '@tabler/icons-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { AlertaCard } from './AlertaCard';
import { useAlertaDismissivel } from '../lib/useAlertaDismissivel';
import { useRegistrarAlertaAtivo } from '../lib/useRegistrarAlertaAtivo';

// Contagem de contas a pagar (empresa ou pessoal) que vencem HOJE e ainda
// estão em aberto - lembrete pra não esquecer de pagar/baixar no dia.
// Renderizado dentro da pilha AlertasFlutuantes, igual os demais alertas.
export function AlertaContasPagarHoje() {
  const { temPermissao } = useAuth();
  const navigate = useNavigate();
  const podeVer = temPermissao('financeiro');
  const { oculto, fechar } = useAlertaDismissivel();

  const query = useQuery({
    queryKey: ['contas-pagar-vencendo-hoje'],
    enabled: podeVer,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { count, error } = await supabase
        .from('contas_pagar')
        .select('id', { count: 'exact', head: true })
        .eq('data_vencimento', hoje)
        .eq('status', 'Em aberto');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const ativo = !!podeVer && !!query.data && query.data > 0 && !oculto;
  useRegistrarAlertaAtivo('contas-pagar-hoje', ativo);
  if (!ativo) return null;

  return (
    <AlertaCard
      count={query.data!}
      descricao={`conta${query.data! > 1 ? 's' : ''} a pagar vencendo hoje`}
      onClick={() => navigate('/financeiro/contas-pagar')}
      onClose={fechar}
      icone={<IconCash size={26} color="var(--copper-500)" />}
    />
  );
}
