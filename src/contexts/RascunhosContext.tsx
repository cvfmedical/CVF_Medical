import { createContext, useContext, useState, type ReactNode } from 'react';

// Um "rascunho" é um formulário de cadastro que o usuário minimizou. Ele vive
// aqui, no nível do app (fora das rotas), para que os dados preenchidos NÃO se
// percam quando ele navega para outra seção do menu. Chave = tabela (cada tela
// de cadastro trabalha uma tabela, então há no máximo um rascunho por tela).
export interface Rascunho {
  tabela: string;
  titulo: string; // rótulo mostrado na barra flutuante
  rota: string; // caminho para onde voltar ao restaurar
  formData: Record<string, unknown>;
  editando: unknown; // registro original (Row) ou null; cada tela conhece o tipo
}

interface RascunhosCtx {
  rascunhos: Rascunho[];
  minimizar: (r: Rascunho) => void;
  fecharRascunho: (tabela: string) => void;
  // Sinaliza que uma tela deve reabrir seu formulário a partir do rascunho.
  pedidoRestauracao: string | null;
  pedirRestauracao: (tabela: string) => void;
  limparPedido: () => void;
}

const Ctx = createContext<RascunhosCtx | null>(null);

export function RascunhosProvider({ children }: { children: ReactNode }) {
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([]);
  const [pedidoRestauracao, setPedido] = useState<string | null>(null);

  const minimizar = (r: Rascunho) =>
    setRascunhos((lista) => [...lista.filter((x) => x.tabela !== r.tabela), r]);
  const fecharRascunho = (tabela: string) =>
    setRascunhos((lista) => lista.filter((x) => x.tabela !== tabela));
  const pedirRestauracao = (tabela: string) => setPedido(tabela);
  const limparPedido = () => setPedido(null);

  return (
    <Ctx.Provider
      value={{ rascunhos, minimizar, fecharRascunho, pedidoRestauracao, pedirRestauracao, limparPedido }}
    >
      {children}
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRascunhos() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRascunhos precisa estar dentro de <RascunhosProvider>');
  return ctx;
}
