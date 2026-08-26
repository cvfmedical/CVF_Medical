import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useContasLiberadasParaFaturar } from '../lib/useContasLiberadasParaFaturar';
import { AlertaCard } from './AlertaCard';
import { useAlertaDismissivel } from '../lib/useAlertaDismissivel';
import { useRegistrarAlertaAtivo } from '../lib/useRegistrarAlertaAtivo';

// Contagem de orçamentos aprovados com OS pronta/entregue e ainda sem NF
// lançada. Query compartilhada com a tela de Faturamento
// (useContasLiberadasParaFaturar). Renderizado dentro da pilha
// AlertasFlutuantes (canto inferior direito).
export function AlertaFaturamentoLiberado() {
  const { temPermissao } = useAuth();
  const navigate = useNavigate();
  const podeVer = temPermissao('financeiro');
  const { oculto, fechar } = useAlertaDismissivel();

  const query = useContasLiberadasParaFaturar(podeVer);

  const ativo = !!podeVer && !!query.data && query.data.length > 0 && !oculto;
  useRegistrarAlertaAtivo('faturamento-liberado', ativo);
  if (!ativo) return null;

  return (
    <AlertaCard
      count={query.data.length}
      descricao={`orçamento${query.data.length > 1 ? 's' : ''} liberado${query.data.length > 1 ? 's' : ''} para faturamento`}
      onClick={() => navigate('/financeiro/faturamento')}
      onClose={fechar}
    />
  );
}
