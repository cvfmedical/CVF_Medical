import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { IconMessageCircle } from '@tabler/icons-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { AlertaCard } from './AlertaCard';
import { useAlertaDismissivel } from '../lib/useAlertaDismissivel';
import { useRegistrarAlertaAtivo } from '../lib/useRegistrarAlertaAtivo';

// Contagem de mensagens não lidas no Chat interno, em qualquer conversa -
// renderizado dentro da pilha AlertasFlutuantes, igual os demais alertas.
// Poll mais espaçado que o do Chat interno em si (essa aqui roda em toda
// tela do sistema, não só na do chat).
export function AlertaChatNovaMensagem() {
  const { funcionario } = useAuth();
  const navigate = useNavigate();
  const { oculto, fechar } = useAlertaDismissivel();
  const meuId = funcionario?.id ?? null;

  const query = useQuery({
    queryKey: ['chat-nao-lidas', meuId],
    enabled: !!meuId,
    refetchInterval: 15000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('mensagens_internas')
        .select('id', { count: 'exact', head: true })
        .eq('destinatario_id', meuId!)
        .is('lida_em', null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const ativo = !!query.data && query.data > 0 && !oculto;
  useRegistrarAlertaAtivo('chat-nova-mensagem', ativo);
  if (!ativo) return null;

  return (
    <AlertaCard
      count={query.data}
      descricao={`nova${query.data > 1 ? 's' : ''} mensage${query.data > 1 ? 'ns' : 'm'} no chat`}
      onClick={() => navigate('/chat')}
      onClose={fechar}
      icone={<IconMessageCircle size={26} color="var(--copper-500)" />}
    />
  );
}
