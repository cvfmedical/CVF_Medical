import { IconArrowDown, IconArrowsSort, IconArrowUp } from '@tabler/icons-react';
import type { DirecaoOrdenacao } from '../lib/useOrdenacao';

export function ThOrdenavel({
  chave,
  colunaAtiva,
  direcao,
  onClick,
  children,
}: {
  chave: string;
  colunaAtiva: string | null;
  direcao: DirecaoOrdenacao;
  onClick: (chave: string) => void;
  children: React.ReactNode;
}) {
  const ativa = colunaAtiva === chave;
  return (
    <th
      onClick={() => onClick(chave)}
      title="Clique para ordenar"
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {ativa ? (
          direcao === 'asc' ? (
            <IconArrowUp size={13} />
          ) : (
            <IconArrowDown size={13} />
          )
        ) : (
          <IconArrowsSort size={13} style={{ opacity: 0.35 }} />
        )}
      </span>
    </th>
  );
}
