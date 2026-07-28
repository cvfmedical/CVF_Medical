// Elemento de assinatura da marca: carta de resolução óptica (círculos
// concêntricos + cruz de centro) - referência direta ao alvo de teste da
// bancada ISO 8600. Usado como logomark, spinner de carregamento (com
// classe "girando") e marca d'água (com opacidade baixa via CSS).
export function Logomark({
  size = 20,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="20" y1="2" x2="20" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="20" y1="32" x2="20" y2="38" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="20" x2="8" y2="20" stroke="currentColor" strokeWidth="1.5" />
      <line x1="32" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
