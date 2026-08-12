import { useNavigate } from 'react-router-dom';
import { IconWindowMaximize, IconX } from '@tabler/icons-react';
import { useRascunhos } from '../contexts/RascunhosContext';

// Barra flutuante com os formulários minimizados. Fica no Layout (fora das
// rotas), então continua visível mesmo quando o usuário muda de tela. Clicar
// no chip volta para a tela de origem e reabre o formulário com os dados.
export function BarraRascunhos() {
  const { rascunhos, pedirRestauracao, fecharRascunho } = useRascunhos();
  const navigate = useNavigate();

  if (rascunhos.length === 0) return null;

  return (
    <div className="barra-rascunhos">
      {rascunhos.map((r) => (
        <div key={r.tabela} className="rascunho-chip">
          <button
            type="button"
            className="rascunho-chip-abrir"
            title="Restaurar formulário"
            onClick={() => {
              navigate(r.rota);
              pedirRestauracao(r.tabela);
            }}
          >
            <IconWindowMaximize size={15} />
            <span>{r.titulo}</span>
          </button>
          <button
            type="button"
            className="rascunho-chip-fechar"
            title="Descartar (perde o que não foi salvo)"
            onClick={() => {
              if (confirm('Descartar este formulário? Os dados não salvos serão perdidos.')) {
                fecharRascunho(r.tabela);
              }
            }}
          >
            <IconX size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
