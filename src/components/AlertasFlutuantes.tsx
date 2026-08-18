import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { IconGripVertical } from '@tabler/icons-react';
import { AlertaOrcamentosPendentes } from './AlertaOrcamentosPendentes';
import { AlertaOSAguardandoOrcamento } from './AlertaOSAguardandoOrcamento';
import { AlertaOrcamentosAprovados } from './AlertaOrcamentosAprovados';
import { AlertaFaturamentoLiberado } from './AlertaFaturamentoLiberado';
import { AlertaEmailFalhou } from './AlertaEmailFalhou';

const CHAVE_POSICAO = 'alertas-flutuantes-posicao';

interface Posicao {
  x: number;
  y: number;
}

function posicaoSalva(): Posicao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_POSICAO);
    if (!bruto) return null;
    return JSON.parse(bruto) as Posicao;
  } catch {
    return null;
  }
}

// Alertas flutuantes (cartões ~5cm x 5cm) - por padrão em linha horizontal
// no rodapé, mas arrastáveis pela alcinha (⠿) pra qualquer canto da tela,
// caso fiquem na frente de algum conteúdo. A posição escolhida fica salva
// (localStorage) entre sessões; "Restaurar posição padrão" no menu de
// contexto da alcinha volta pro rodapé centralizado.
export function AlertasFlutuantes() {
  const [posicao, setPosicao] = useState<Posicao | null>(() => posicaoSalva());
  const arrastandoRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoMover(e: PointerEvent) {
      if (!arrastandoRef.current) return;
      const largura = containerRef.current?.offsetWidth ?? 200;
      const altura = containerRef.current?.offsetHeight ?? 200;
      const x = Math.min(Math.max(0, e.clientX - arrastandoRef.current.offsetX), window.innerWidth - largura);
      const y = Math.min(Math.max(0, e.clientY - arrastandoRef.current.offsetY), window.innerHeight - altura);
      setPosicao({ x, y });
    }
    function aoSoltar() {
      if (!arrastandoRef.current) return;
      arrastandoRef.current = null;
      setPosicao((p) => {
        if (p) localStorage.setItem(CHAVE_POSICAO, JSON.stringify(p));
        return p;
      });
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    return () => {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
    };
  }, []);

  function iniciarArrasto(e: ReactPointerEvent) {
    const retangulo = containerRef.current?.getBoundingClientRect();
    if (!retangulo) return;
    arrastandoRef.current = { offsetX: e.clientX - retangulo.left, offsetY: e.clientY - retangulo.top };
    if (!posicao) setPosicao({ x: retangulo.left, y: retangulo.top });
  }

  function restaurarPosicaoPadrao() {
    setPosicao(null);
    localStorage.removeItem(CHAVE_POSICAO);
  }

  const estiloPosicao: CSSProperties = posicao
    ? { position: 'fixed', left: posicao.x, top: posicao.y, zIndex: 100 }
    : { position: 'fixed', left: 0, right: 0, bottom: 16, zIndex: 100, display: 'flex', justifyContent: 'center' };

  return (
    <div style={estiloPosicao}>
      <div
        ref={containerRef}
        style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}
      >
        <button
          onPointerDown={iniciarArrasto}
          onDoubleClick={restaurarPosicaoPadrao}
          title="Arraste pra mover - clique duplo restaura a posição padrão"
          style={{
            cursor: 'grab',
            background: 'var(--graphite-900)',
            color: '#f0f0ef',
            border: 'none',
            borderRadius: 8,
            width: 22,
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            touchAction: 'none',
            flexShrink: 0,
          }}
        >
          <IconGripVertical size={14} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
          <AlertaOrcamentosPendentes />
          <AlertaOSAguardandoOrcamento />
          <AlertaOrcamentosAprovados />
          <AlertaFaturamentoLiberado />
          <AlertaEmailFalhou />
        </div>
      </div>
    </div>
  );
}
