import type { ReactNode } from 'react';

export type TonoBadge = 'teal' | 'copper' | 'neutro' | 'danger';

// Pill de status. Cor codifica significado (não sequência): teal = status
// positivo/em andamento, copper = ação/atenção, neutro = estrutural,
// danger = reprovado/crítico.
export function Badge({ tono = 'neutro', children }: { tono?: TonoBadge; children: ReactNode }) {
  return <span className={`badge badge-${tono}`}>{children}</span>;
}
