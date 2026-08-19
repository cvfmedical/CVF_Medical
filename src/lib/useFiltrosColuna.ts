import { useState } from 'react';
import { normalizarBusca } from './normalizarBusca';

const REGEX_DATA_PURA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

// Datas/timestamps crus (ISO) viram texto ilegível num filtro ("2026-08-
// 19T18:35:30...") - formata pro mesmo jeito que a tabela já mostra
// (DD/MM/AAAA ou DD/MM/AAAA, HH:mm:ss), só pra exibição/busca no filtro.
// 'T00:00:00' força meia-noite local em vez de UTC pra datas puras, senão
// desloca um dia pra trás em fusos negativos (mesmo cuidado já usado nas
// telas que formatam data_vencimento etc.).
export function formatarValorParaFiltro(valorBruto: unknown): string {
  const s = String(valorBruto ?? '').trim();
  if (!s) return '';
  if (REGEX_DATA_PURA.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
  }
  if (REGEX_TIMESTAMP.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleString('pt-BR');
  }
  return s;
}

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

  function limparTudo() {
    setTextos({});
    setValores({});
  }

  const algumFiltroAtivo = Object.values(textos).some((v) => v.trim()) || Object.values(valores).some((s) => s.size > 0);

  function passaFiltro(valorBruto: unknown, chave: string): boolean {
    const texto = textos[chave];
    const selecionados = valores[chave];
    const valorStr = String(valorBruto ?? '');
    if (texto?.trim()) {
      const alvo = normalizarBusca(termo(texto));
      const bate =
        normalizarBusca(valorStr).includes(alvo) || normalizarBusca(formatarValorParaFiltro(valorBruto)).includes(alvo);
      if (!bate) return false;
    }
    if (selecionados && selecionados.size > 0 && !selecionados.has(valorStr)) return false;
    return true;
  }

  function termo(t: string) {
    return t.trim();
  }

  return { textos, valores, setTexto, setValoresColuna, passaFiltro, limparTudo, algumFiltroAtivo };
}
