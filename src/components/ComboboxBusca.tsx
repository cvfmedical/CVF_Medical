import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizarBusca } from '../lib/normalizarBusca';

export interface OpcaoCombobox {
  value: string;
  label: string;
}

export interface ComboboxBuscaProps {
  opcoes: OpcaoCombobox[];
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  // Quando a busca não acha nada, mostra um item pra criar na hora (ex:
  // cadastro rápido de cliente final) em vez de só "Nenhum resultado".
  aoCriarNovo?: (texto: string) => void;
  textoCriarNovo?: string;
}

// Select nativo troca por isto quando a lista referencia um cadastro que
// pode crescer (cliente, produto, catálogo etc.) - digitar filtra em vez
// de rolar uma lista inteira. Enums pequenos e fixos (status, tipo) não
// precisam disso e continuam <select> nativo.
export function ComboboxBusca({
  opcoes,
  valor,
  onChange,
  placeholder = 'Buscar...',
  disabled,
  aoCriarNovo,
  textoCriarNovo = 'Cadastrar',
}: ComboboxBuscaProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const opcaoSelecionada = useMemo(() => opcoes.find((o) => o.value === valor) ?? null, [opcoes, valor]);

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return opcoes;
    return opcoes.filter((o) => normalizarBusca(o.label).includes(termo));
  }, [opcoes, busca]);

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

  useEffect(() => {
    setIndiceAtivo(0);
  }, [busca, aberto]);

  function abrir() {
    if (disabled) return;
    setAberto(true);
    setBusca('');
  }

  function selecionar(op: OpcaoCombobox) {
    onChange(op.value);
    setAberto(false);
    setBusca('');
  }

  function limpar() {
    onChange('');
    setBusca('');
    setAberto(false);
  }

  function criarNovo() {
    const texto = busca.trim();
    if (!texto || !aoCriarNovo) return;
    aoCriarNovo(texto);
    setAberto(false);
    setBusca('');
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        abrir();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.min(i + 1, filtradas.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const op = filtradas[indiceAtivo];
      if (op) selecionar(op);
      else if (filtradas.length === 0) criarNovo();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAberto(false);
      setBusca('');
    }
  }

  return (
    <div className="combobox-busca" ref={containerRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls="combobox-lista"
        disabled={disabled}
        placeholder={placeholder}
        value={aberto ? busca : (opcaoSelecionada?.label ?? '')}
        onFocus={abrir}
        onChange={(e) => {
          setBusca(e.target.value);
          if (!aberto) setAberto(true);
        }}
        onKeyDown={aoTeclar}
      />
      {opcaoSelecionada && !aberto && (
        <button
          type="button"
          className="combobox-limpar"
          title="Limpar seleção"
          onMouseDown={(e) => {
            e.preventDefault();
            limpar();
          }}
        >
          ×
        </button>
      )}
      {aberto && (
        <ul className="combobox-lista" id="combobox-lista" role="listbox">
          {filtradas.length === 0 && aoCriarNovo && busca.trim() && (
            <li
              className={`combobox-item combobox-criar${indiceAtivo === 0 ? ' ativo' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                criarNovo();
              }}
            >
              + {textoCriarNovo} "{busca.trim()}"
            </li>
          )}
          {filtradas.length === 0 && (!aoCriarNovo || !busca.trim()) && (
            <li className="combobox-item combobox-vazio">Nenhum resultado</li>
          )}
          {filtradas.map((op, i) => (
            <li
              key={op.value}
              role="option"
              aria-selected={op.value === valor}
              className={`combobox-item${i === indiceAtivo ? ' ativo' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                selecionar(op);
              }}
              onMouseEnter={() => setIndiceAtivo(i)}
            >
              {op.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
