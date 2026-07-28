import { Logomark } from './Logomark';

export function CarregandoTela({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <div className="tela-carregando">
      <Logomark size={28} className="logomark-girando" />
      <span>{texto}</span>
    </div>
  );
}
