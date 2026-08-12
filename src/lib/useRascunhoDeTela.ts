import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRascunhos } from '../contexts/RascunhosContext';

interface Opcoes {
  titulo: string;
  // Snapshot serializável do formulário no momento de minimizar.
  obterEstado: () => Record<string, unknown>;
  // Reaplica o estado e reabre o formulário ao restaurar.
  aoRestaurar: (estado: Record<string, unknown>) => void;
}

// Liga uma tela ao contexto global de rascunhos: minimizar guarda o estado
// (sobrevive à navegação entre seções do menu) e restaurar reabre o formulário
// com os dados. `chave` deve ser única por tela (ex: 'entrada-equipamento').
export function useRascunhoDeTela(chave: string, opts: Opcoes) {
  const { minimizar, rascunhos, pedidoRestauracao, fecharRascunho, limparPedido } = useRascunhos();
  const location = useLocation();

  useEffect(() => {
    if (pedidoRestauracao !== chave) return;
    const r = rascunhos.find((x) => x.tabela === chave);
    if (r) {
      opts.aoRestaurar(r.formData);
      fecharRascunho(chave);
    }
    limparPedido();
    // Só reage à mudança do pedido de restauração.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoRestauracao]);

  return {
    minimizar: () =>
      minimizar({
        tabela: chave,
        titulo: opts.titulo,
        rota: location.pathname + location.search,
        formData: opts.obterEstado(),
        editando: null,
      }),
  };
}
