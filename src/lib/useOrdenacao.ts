import { useMemo, useState } from 'react';

export type DirecaoOrdenacao = 'asc' | 'desc';

// Comparador genérico: números e booleanos comparam por valor, o resto vira
// string e compara com collation pt-BR (acentos/maiúsculas corretos, e
// "numeric" pra "Item 2" vir antes de "Item 10"). null/undefined/'' sempre
// vão pro fim, nas duas direções.
function comparar(a: unknown, b: unknown): number {
  const aVazio = a == null || a === '';
  const bVazio = b == null || b === '';
  if (aVazio && bVazio) return 0;
  if (aVazio) return 1;
  if (bVazio) return -1;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

// Ordenação clicável de tabela - clique numa coluna ordena crescente, clique
// de novo na mesma inverte pra decrescente. `valorDe` deixa ordenar por um
// valor derivado (ex: nome resolvido via lookup por id) em vez de só a
// chave crua da linha; por padrão usa row[chave].
export function useLinhasOrdenadas<Row>(
  linhas: Row[],
  colunaInicial: string | null = null,
  valorDe?: (row: Row, chave: string) => unknown,
) {
  const [coluna, setColuna] = useState<string | null>(colunaInicial);
  const [direcao, setDirecao] = useState<DirecaoOrdenacao>('asc');

  function ordenarPor(chave: string) {
    if (chave === coluna) {
      setDirecao((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setColuna(chave);
      setDirecao('asc');
    }
  }

  const linhasOrdenadas = useMemo(() => {
    if (!coluna) return linhas;
    const getter = valorDe ?? ((row: Row, chave: string) => (row as Record<string, unknown>)[chave]);
    const copia = [...linhas];
    copia.sort((a, b) => {
      const cmp = comparar(getter(a, coluna), getter(b, coluna));
      return direcao === 'asc' ? cmp : -cmp;
    });
    return copia;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, coluna, direcao]);

  return { linhasOrdenadas, coluna, direcao, ordenarPor };
}
