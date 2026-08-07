import type { ReactNode } from 'react';
import { IconAlertCircle, IconX } from '@tabler/icons-react';

// Cartão compacto (~5cm x 5cm) usado pelos alertas flutuantes - a pilha
// que os posiciona (AlertasFlutuantes) fica em linha no rodapé. Tem um
// botão de fechar (X) que dispara onClose (o alerta some por 10 min).
export function AlertaCard({
  count,
  descricao,
  onClick,
  onClose,
  icone,
}: {
  count: number;
  descricao: string;
  onClick: () => void;
  onClose: () => void;
  icone?: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: 189,
        height: 189,
        flexShrink: 0,
      }}
    >
      <button
        onClick={onClick}
        style={{
          width: '100%',
          height: '100%',
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
      <button
        onClick={onClose}
        title="Fechar (reaparece em 10 min)"
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 24,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.12)',
          color: '#f0f0ef',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
        }}
      >
        <IconX size={14} />
      </button>
    </div>
  );
}
