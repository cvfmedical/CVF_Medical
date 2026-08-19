import { useState } from 'react';
import { normalizarBusca } from './normalizarBusca';

// Estado combinado dos dois jeitos de filtrar uma coluna: texto parcial
// (campo-filtro-coluna) e lista de valores exatos marcados (estilo Excel,
// FiltroColunaValores). Os dois se combinam com E entre si, e cada um
// dentro de si mesmo já resolve a lógica (texto = contém; valores = está
// na lista marcada).
export function useFiltrosColuna() {
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [valores, setValores] = useState<Record<string, Set<string>>>({});

  function setTexto(chave: string, v: string) {
    setTextos((t) => ({ ...t, [chave]: v }));
  }

  function setValoresColuna(chave: string, v: Set<string>) {
    setValores((s) => ({ ...s, [chave]: v }));
  }

  function passaFiltro(valorBruto: unknown, chave: string): boolean {
    const texto = textos[chave];
    const selecionados = valores[chave];
    const valorStr = String(valorBruto ?? '');
    if (texto?.trim() && !normalizarBusca(valorStr).includes(normalizarBusca(texto.trim()))) return false;
    if (selecionados && selecionados.size > 0 && !selecionados.has(valorStr)) return false;
    return true;
  }

  return { textos, valores, setTexto, setValoresColuna, passaFiltro };
}
