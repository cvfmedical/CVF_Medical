import { useRef, useState, type ReactNode } from 'react';
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
// com minimizar / maximizar / fechar (estilo Windows), corpo rolável e ARRASTE
// pela barra (clicar e mover a janela para tirar da frente do conteúdo atrás).
export function ModalJanela({ titulo, aoFechar, aoMinimizar, larguraMax, children }: ModalJanelaProps) {
  const [maximizado, setMaximizado] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const arrasto = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  function aoMover(e: MouseEvent) {
    const a = arrasto.current;
    if (!a) return;
    setPos({ x: a.ox + (e.clientX - a.px), y: a.oy + (e.clientY - a.py) });
  }

  function aoSoltar() {
    arrasto.current = null;
    window.removeEventListener('mousemove', aoMover);
    window.removeEventListener('mouseup', aoSoltar);
  }

  function aoPressionarBarra(e: React.MouseEvent) {
    // Não arrasta quando maximizado nem ao clicar nos botões da janela.
    if (maximizado) return;
    if ((e.target as HTMLElement).closest('.janela-btn')) return;
    arrasto.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
    window.addEventListener('mousemove', aoMover);
    window.addEventListener('mouseup', aoSoltar);
    e.preventDefault();
  }

  return (
    <div className="modal-fundo">
      <div
        className={`modal-card modal-card-janela${maximizado ? ' maximizado' : ''}`}
        style={{
          ...(maximizado ? {} : { transform: `translate(${pos.x}px, ${pos.y}px)` }),
          ...(!maximizado && larguraMax ? { maxWidth: larguraMax } : {}),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-titulo-barra"
          style={{ cursor: maximizado ? 'default' : 'move' }}
          onMouseDown={aoPressionarBarra}
          onDoubleClick={() => setMaximizado((m) => !m)}
        >
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
