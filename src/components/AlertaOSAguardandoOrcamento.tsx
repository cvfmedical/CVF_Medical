import { useNavigate } from 'react-router-dom';
import { IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useOSAguardandoOrcamento } from '../lib/useOSAguardandoOrcamento';

// Alerta flutuante (canto inferior direito) com a contagem de OS
// aguardando montagem de orçamento (técnico) - espelha
// AlertaOrcamentosPendentes (canto esquerdo, financeiro). Posicionado à
// direita pra não sobrepor quando o mesmo Administrador vê os dois.
export function AlertaOSAguardandoOrcamento() {
  const { temPermissao } = useAuth();
  const navigate = useNavigate();
  const podeVer = temPermissao('laboratorio_qualidade');

  const query = useOSAguardandoOrcamento(podeVer);

  if (!podeVer || !query.data || query.data.length === 0) return null;

  return (
    <button
      onClick={() => navigate('/orcamento-tecnico')}
      style={{
        position: 'fixed',
        right: 24,
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
      {query.data.length} OS{query.data.length > 1 ? 's' : ''} aguardando orçamento
    </button>
  );
}
