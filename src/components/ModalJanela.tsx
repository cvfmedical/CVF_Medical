import { useState, type ReactNode } from 'react';
import {
  IconMinus,
  IconWindowMaximize,
  IconWindowMinimize,
  IconX,
} from '@tabler/icons-react';

interface ModalJanelaProps {
  titulo: ReactNode;
  aoFechar: () => void;
  // Quando fornecido, mostra o botão de minimizar. O pai é quem decide o que
  // fazer (normalmente: registrar o rascunho no contexto global e fechar).
  aoMinimizar?: () => void;
  // Largura do card no estado normal (não maximizado). Padrão 480px.
  larguraMax?: number;
  children: ReactNode;
}

// Moldura de janela padrão de TODOS os modais do sistema: barra de título azul
// com minimizar / maximizar / fechar (estilo Windows) + corpo rolável. Centraliza
// o visual e o comportamento para não repetir em cada tela.
export function ModalJanela({ titulo, aoFechar, aoMinimizar, larguraMax, children }: ModalJanelaProps) {
  const [maximizado, setMaximizado] = useState(false);

  return (
    <div className="modal-fundo">
      <div
        className={`modal-card modal-card-janela${maximizado ? ' maximizado' : ''}`}
        style={!maximizado && larguraMax ? { maxWidth: larguraMax } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-titulo-barra" onDoubleClick={() => setMaximizado((m) => !m)}>
          <h2>{titulo}</h2>
          <div className="modal-janela-botoes">
            {aoMinimizar && (
              <button type="button" className="janela-btn" title="Minimizar" onClick={aoMinimizar}>
                <IconMinus size={15} />
              </button>
            )}
            <button
              type="button"
              className="janela-btn"
              title={maximizado ? 'Restaurar' : 'Maximizar'}
              onClick={() => setMaximizado((m) => !m)}
            >
              {maximizado ? <IconWindowMinimize size={15} /> : <IconWindowMaximize size={15} />}
            </button>
            <button type="button" className="janela-btn fechar" title="Fechar" onClick={aoFechar}>
              <IconX size={15} />
            </button>
          </div>
        </div>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}
