export function EmConstrucao({ nome }: { nome?: string }) {
  return (
    <div>
      <h2>Módulo em construção</h2>
      <p>
        {nome ? `A interface para "${nome}"` : 'Esta interface'} está mapeada e será
        desenvolvida nas próximas etapas da migração para web.
      </p>
    </div>
  );
}
