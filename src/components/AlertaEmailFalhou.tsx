import { IconMailX } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEmailsComFalha } from '../lib/useEmailsComFalha';
import { AlertaCard } from './AlertaCard';
import { useAlertaDismissivel } from '../lib/useAlertaDismissivel';

// E-mails de orçamento que o Resend confirmou terem falhado (endereço
// inválido/inexistente) ou gerado reclamação - só se sabe disso depois,
// via webhook (ver supabase/functions/resend-webhook). Renderizado dentro
// da pilha AlertasFlutuantes.
export function AlertaEmailFalhou() {
  const { temPermissao } = useAuth();
  const navigate = useNavigate();
  const podeVer = temPermissao('financeiro');
  const { oculto, fechar } = useAlertaDismissivel();

  const query = useEmailsComFalha(podeVer);

  if (!podeVer || !query.data || query.data.length === 0 || oculto) return null;

  return (
    <AlertaCard
      count={query.data.length}
      descricao={`e-mail${query.data.length > 1 ? 's' : ''} de orçamento não entregue${query.data.length > 1 ? 's' : ''}`}
      icone={<IconMailX size={26} color="var(--danger-500)" />}
      onClick={() => navigate('/orcamento-financeiro')}
      onClose={fechar}
    />
  );
}
