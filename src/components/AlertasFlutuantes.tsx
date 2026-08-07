import { AlertaOrcamentosPendentes } from './AlertaOrcamentosPendentes';
import { AlertaOSAguardandoOrcamento } from './AlertaOSAguardandoOrcamento';
import { AlertaOrcamentosAprovados } from './AlertaOrcamentosAprovados';

// Alertas flutuantes (cartões ~5cm x 5cm) em linha horizontal no rodapé
// - assim ocupam só uma faixa embaixo e não atrapalham a visão do
// conteúdo. Cada cartão tem um X pra fechar (reaparece em 10 min).
export function AlertasFlutuantes() {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 16,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: 12,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', gap: 12, pointerEvents: 'auto' }}>
        <AlertaOrcamentosPendentes />
        <AlertaOSAguardandoOrcamento />
        <AlertaOrcamentosAprovados />
      </div>
    </div>
  );
}
