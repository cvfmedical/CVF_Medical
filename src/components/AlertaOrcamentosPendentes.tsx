import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { IconAlertCircle } from '@tabler/icons-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

// Alerta flutuante (canto inferior esquerdo) com a contagem de orçamentos
// aguardando precificação/envio - só aparece para quem tem permissão
// financeira, e some quando a fila está vazia.
export function AlertaOrcamentosPendentes() {
  const { temPermissao } = useAuth();
  const navigate = useNavigate();
  const podeVer = temPermissao('financeiro');

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

  if (!podeVer || !query.data) return null;

  return (
    <button
      onClick={() => navigate('/orcamento-financeiro')}
      style={{
        position: 'fixed',
        left: 24,
        bottom: 24,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--graphite-900)',
        color: '#f0f0ef',
        border: 'none',
        borderRadius: 8,
        padding: '10px 16px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        fontSize: 13,
      }}
    >
      <IconAlertCircle size={18} color="var(--copper-500)" />
      {query.data} orçamento{query.data > 1 ? 's' : ''} aguardando precificação
    </button>
  );
}
