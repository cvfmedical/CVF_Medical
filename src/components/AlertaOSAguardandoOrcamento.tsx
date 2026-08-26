import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOSAguardandoOrcamento } from '../lib/useOSAguardandoOrcamento';
import { AlertaCard } from './AlertaCard';
import { useAlertaDismissivel } from '../lib/useAlertaDismissivel';
import { useRegistrarAlertaAtivo } from '../lib/useRegistrarAlertaAtivo';

// Contagem de OS aguardando montagem de orçamento (técnico). Renderizado
// dentro da pilha AlertasFlutuantes (canto inferior direito).
export function AlertaOSAguardandoOrcamento() {
  const { temPermissao } = useAuth();
  const navigate = useNavigate();
  const podeVer = temPermissao('laboratorio_qualidade');
  const { oculto, fechar } = useAlertaDismissivel();

  const query = useOSAguardandoOrcamento(podeVer);

  const ativo = !!podeVer && !!query.data && query.data.length > 0 && !oculto;
  useRegistrarAlertaAtivo('os-aguardando-orcamento', ativo);
  if (!ativo) return null;

  return (
    <AlertaCard
      count={query.data.length}
      descricao={`OS${query.data.length > 1 ? 's' : ''} aguardando orçamento`}
      onClick={() => navigate('/orcamento-tecnico')}
      onClose={fechar}
    />
  );
}
