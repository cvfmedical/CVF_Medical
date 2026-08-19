import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { normalizarBusca } from '../lib/normalizarBusca';
import { formatarValorParaFiltro } from '../lib/useFiltrosColuna';

export interface FiltroColunaValoresProps {
  valores: string[];
  // Rótulo alternativo por valor cru, para colunas cujo `render` mostra
  // algo que não é uma formatação genérica de data (ex: Badge "Aguardando"
  // quando o campo timestamp está vazio). Sem entrada pro valor, cai no
  // formatarValorParaFiltro (detecta data/timestamp ISO).
  rotulos?: Record<string, string>;
  selecionados: Set<string>;
  onChange: (novo: Set<string>) => void;
}

// Filtro "estilo Excel" - clica na seta, marca um ou mais valores exatos
// que já existem na coluna. Complementa (não substitui) o campo de busca
// por texto parcial que já existe ao lado dele.
export function FiltroColunaValores({ valores, rotulos, selecionados, onChange }: FiltroColunaValoresProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca('');
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  function rotulo(v: string): string {
    return rotulos?.[v] ?? formatarValorParaFiltro(v);
  }

  const termo = normalizarBusca(busca.trim());
  const valoresFiltrados = termo
    ? valores.filter((v) => normalizarBusca(v).includes(termo) || normalizarBusca(rotulo(v)).includes(termo))
    : valores;

  function alternar(v: string) {
    const novo = new Set(selecionados);
    if (novo.has(v)) novo.delete(v);
    else novo.add(v);
    onChange(novo);
  }

  return (
    <div className="filtro-coluna-wrap" ref={containerRef}>
      <button
        type="button"
        className={`filtro-coluna-seta${selecionados.size > 0 ? ' ativo' : ''}`}
        title="Filtrar por valores da coluna"
        onClick={() => setAberto((a) => !a)}
      >
        <IconChevronDown size={12} />
      </button>
      {aberto && (
        <div className="filtro-coluna-painel">
          <input
            type="text"
            className="campo-filtro-coluna"
            placeholder="Buscar valor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            autoFocus
          />
          <div className="filtro-coluna-acoes">
            <button type="button" onClick={() => onChange(new Set(valores))}>
              Selecionar todos
            </button>
            <button type="button" onClick={() => onChange(new Set())}>
              Limpar
            </button>
          </div>
          <ul className="filtro-coluna-lista">
            {valoresFiltrados.map((v) => (
              <li key={v}>
                <label>
                  <input type="checkbox" checked={selecionados.has(v)} onChange={() => alternar(v)} />
                  <span>{rotulo(v) || '(vazio)'}</span>
                </label>
              </li>
            ))}
            {valoresFiltrados.length === 0 && <li className="filtro-coluna-vazio">Nenhum valor encontrado</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
