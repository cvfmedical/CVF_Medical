import type { ReactNode } from 'react';
import { IconAlertCircle } from '@tabler/icons-react';

// Cartão compacto (~5cm x 5cm) usado pelos alertas flutuantes - a pilha
// que os posiciona (AlertasFlutuantes) fica ancorada no canto inferior
// direito e cresce pra cima conforme mais alertas ficam visíveis.
export function AlertaCard({ count, descricao, onClick, icone }: { count: number; descricao: string; onClick: () => void; icone?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 189,
        height: 189,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: 'var(--graphite-900)',
        color: '#f0f0ef',
        border: 'none',
        borderRadius: 12,
        boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
        padding: 16,
        textAlign: 'center',
        cursor: 'pointer',
      }}
    >
      {icone ?? <IconAlertCircle size={26} color="var(--copper-500)" />}
      <div style={{ fontSize: 34, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 12, lineHeight: 1.35 }}>{descricao}</div>
    </button>
  );
}
