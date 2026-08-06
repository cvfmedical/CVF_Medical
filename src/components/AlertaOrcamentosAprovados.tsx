import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOrcamentosAprovados } from '../lib/useOrcamentosAprovados';
import { AlertaCard } from './AlertaCard';

// Contagem de orçamentos aprovados pelo cliente, ainda esperando o
// técnico iniciar/terminar a manutenção. Query compartilhada com a
// tela "Orçamentos aprovados" (useOrcamentosAprovados). Renderizado
// dentro da pilha AlertasFlutuantes (canto inferior direito).
export function AlertaOrcamentosAprovados() {
  const { temPermissao } = useAuth();
  const navigate = useNavigate();
  const podeVer = temPermissao('laboratorio_qualidade');

  const query = useOrcamentosAprovados(podeVer);

  if (!podeVer || !query.data || query.data.length === 0) return null;

  return (
    <AlertaCard
      count={query.data.length}
      descricao={`orçamento${query.data.length > 1 ? 's' : ''} aprovado${query.data.length > 1 ? 's' : ''} aguardando manutenção`}
      onClick={() => navigate('/orcamentos-aprovados')}
    />
  );
}
