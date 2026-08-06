import { AlertaOrcamentosPendentes } from './AlertaOrcamentosPendentes';
import { AlertaOSAguardandoOrcamento } from './AlertaOSAguardandoOrcamento';
import { AlertaOrcamentosAprovados } from './AlertaOrcamentosAprovados';

// Pilha de alertas flutuantes (cartões ~5cm x 5cm), ancorada no canto
// inferior direito - com "bottom" fixo e altura automática, a pilha
// cresce pra cima conforme mais alertas ficam visíveis, sem precisar
// calcular posição individual de cada cartão.
export function AlertasFlutuantes() {
  return (
    <div
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <AlertaOrcamentosAprovados />
      <AlertaOSAguardandoOrcamento />
      <AlertaOrcamentosPendentes />
    </div>
  );
}
