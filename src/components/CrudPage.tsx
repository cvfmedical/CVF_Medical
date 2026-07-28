import { useMemo, useState } from 'react';
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { useCrud } from '../lib/useCrud';
import { mensagemErro } from '../lib/erros';
import { CarregandoTela } from './CarregandoTela';

export type TipoCampo = 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date';

export interface OpcaoSelect {
  value: string;
  label: string;
}

export interface CampoConfig {
  name: string;
  label: string;
  type: TipoCampo;
  // string[]: valor e rótulo iguais. OpcaoSelect[]: valor (ex: id) e rótulo
  // (ex: nome) diferentes - necessário quando o campo referencia outra
  // tabela por id (ex: cliente_id em Equipamentos do cliente).
  opcoes?: string[] | OpcaoSelect[];
  obrigatorio?: boolean;
}

function normalizarOpcoes(opcoes: string[] | OpcaoSelect[] | undefined): OpcaoSelect[] {
  if (!opcoes) return [];
  return opcoes.map((op) => (typeof op === 'string' ? { value: op, label: op } : op));
}

export interface ColunaConfig<Row> {
  chave: string;
  label: string;
  render?: (row: Row) => React.ReactNode;
  // Identificadores (Nº OS, nº de série, código de laudo) usam
  // IBM Plex Mono, discreto, pra não competir com o conteúdo da linha.
  mono?: boolean;
}

export interface CrudPageProps<Row extends { id: number }> {
  titulo: string;
  tabela: string;
  colunas: ColunaConfig<Row>[];
  campos: CampoConfig[];
  ordenarPor?: string;
  camposFiltro?: string[];
  valorInicial?: Record<string, unknown>;
  validar?: (dados: Record<string, unknown>) => string | null;
  antesDeEnviar?: (dados: Record<string, unknown>) => Record<string, unknown>;
}

export function CrudPage<Row extends { id: number }>({
  titulo,
  tabela,
  colunas,
  campos,
  ordenarPor = 'id',
  camposFiltro,
  valorInicial = {},
  validar,
  antesDeEnviar,
}: CrudPageProps<Row>) {
  const { listQuery, criar, atualizar, excluir } = useCrud<Row>(tabela, ordenarPor);
  const [filtro, setFiltro] = useState('');
  const [editando, setEditando] = useState<Row | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const linhas = useMemo(() => {
    const todas = listQuery.data ?? [];
    if (!filtro.trim() || !camposFiltro?.length) return todas;
    const termo = filtro.trim().toLowerCase();
    return todas.filter((linha) =>
      camposFiltro.some((campo) =>
        String((linha as Record<string, unknown>)[campo] ?? '')
          .toLowerCase()
          .includes(termo),
      ),
    );
  }, [listQuery.data, filtro, camposFiltro]);

  function abrirNovo() {
    setEditando(null);
    setFormData({ ...valorInicial });
    setErro(null);
    setModalAberto(true);
  }

  function abrirEdicao(row: Row) {
    setEditando(row);
    setFormData({ ...row });
    setErro(null);
    setModalAberto(true);
  }

  function fechar() {
    setModalAberto(false);
    setErro(null);
  }

  async function salvar() {
    setErro(null);
    if (validar) {
      const msg = validar(formData);
      if (msg) {
        setErro(msg);
        return;
      }
    }
    const dados = antesDeEnviar ? antesDeEnviar(formData) : formData;
    setSalvando(true);
    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando.id, dados: dados as Partial<Row> });
      } else {
        await criar.mutateAsync(dados as Partial<Row>);
      }
      setModalAberto(false);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(row: Row) {
    if (!confirm('Confirma a exclusão deste registro?')) return;
    try {
      await excluir.mutateAsync(row.id);
    } catch (e) {
      alert(mensagemErro(e));
    }
  }

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>{titulo}</h1>
        <button className="botao-primario botao-pequeno" onClick={abrirNovo}>
          <IconPlus size={16} /> Novo
        </button>
      </div>

      {camposFiltro && camposFiltro.length > 0 && (
        <input
          className="campo-filtro"
          placeholder="Buscar..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      )}

      {listQuery.isLoading && <CarregandoTela />}
      {listQuery.isError && <p className="erro-login">{mensagemErro(listQuery.error)}</p>}

      {!listQuery.isLoading && !listQuery.isError && (
        <table className="tabela-crud">
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c.chave}>{c.label}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((row) => (
              <tr key={row.id}>
                {colunas.map((c) => (
                  <td key={c.chave} className={c.mono ? 'mono' : undefined}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.chave] ?? '')}
                  </td>
                ))}
                <td className="acoes-tabela">
                  <button className="botao-icone" title="Editar" onClick={() => abrirEdicao(row)}>
                    <IconPencil size={16} />
                  </button>
                  <button
                    className="botao-icone perigo"
                    title="Excluir"
                    onClick={() => handleExcluir(row)}
                  >
                    <IconTrash size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={colunas.length + 1}>Nenhum registro encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {modalAberto && (
        <div className="modal-fundo" onClick={fechar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>{editando ? 'Editar' : 'Novo'}</h2>
            {campos.map((campo) => (
              <div className="campo-form" key={campo.name}>
                <label>
                  {campo.label}
                  {campo.obrigatorio ? ' *' : ''}
                </label>
                {campo.type === 'textarea' ? (
                  <textarea
                    value={String(formData[campo.name] ?? '')}
                    onChange={(e) => setFormData((f) => ({ ...f, [campo.name]: e.target.value }))}
                  />
                ) : campo.type === 'select' ? (
                  <select
                    value={String(formData[campo.name] ?? '')}
                    onChange={(e) => setFormData((f) => ({ ...f, [campo.name]: e.target.value }))}
                  >
                    <option value="">Selecione...</option>
                    {normalizarOpcoes(campo.opcoes).map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                ) : campo.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={Boolean(formData[campo.name] ?? false)}
                    onChange={(e) => setFormData((f) => ({ ...f, [campo.name]: e.target.checked }))}
                  />
                ) : (
                  <input
                    type={campo.type}
                    value={String(formData[campo.name] ?? '')}
                    onChange={(e) => setFormData((f) => ({ ...f, [campo.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={fechar} disabled={salvando}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
