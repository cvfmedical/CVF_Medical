import { useMemo, useState } from 'react';
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconMinus,
  IconWindowMaximize,
  IconWindowMinimize,
  IconX,
} from '@tabler/icons-react';
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
  // Ao mudar este campo, retorna um objeto para preencher AUTOMATICAMENTE
  // outros campos do formulário (ex: escolher um modelo do catálogo
  // preenche fabricante/modelo/tipo/descrição). Retorne nada para não mexer.
  aoMudar?: (valor: string, form: Record<string, unknown>) => Record<string, unknown> | void;
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
  // Efeito colateral pós-salvar (ex: telas de teste que precisam voltar o
  // status da OS para "Em Manutenção" quando o resultado é reprovado).
  aposSalvar?: (dadosEnviados: Record<string, unknown>) => Promise<void>;
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
  aposSalvar,
}: CrudPageProps<Row>) {
  const { listQuery, criar, atualizar, excluir } = useCrud<Row>(tabela, ordenarPor);
  const [filtro, setFiltro] = useState('');
  const [editando, setEditando] = useState<Row | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  // Controles de janela do formulário (igual às janelas do Windows). Minimizar
  // mantém os dados preenchidos e libera a tela atrás; maximizar amplia.
  const [minimizado, setMinimizado] = useState(false);
  const [maximizado, setMaximizado] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Atualiza um campo e, se ele tiver `aoMudar`, mescla os campos que ele
  // preenche automaticamente (ex: puxar do catálogo).
  function atualizarCampo(campo: CampoConfig, valor: unknown) {
    setFormData((f) => {
      const base = { ...f, [campo.name]: valor };
      const extra = campo.aoMudar?.(String(valor ?? ''), base);
      return extra ? { ...base, ...extra } : base;
    });
  }

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
    setMinimizado(false);
    setMaximizado(false);
    setModalAberto(true);
  }

  function abrirEdicao(row: Row) {
    setEditando(row);
    setFormData({ ...row });
    setErro(null);
    setMinimizado(false);
    setMaximizado(false);
    setModalAberto(true);
  }

  function fechar() {
    setModalAberto(false);
    setMinimizado(false);
    setMaximizado(false);
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
      if (aposSalvar) await aposSalvar(dados);
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
        <div className={`modal-fundo${minimizado ? ' minimizado' : ''}`}>
          <div
            className={`modal-card modal-card-janela${maximizado ? ' maximizado' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-titulo-barra"
              onDoubleClick={() => setMaximizado((m) => !m)}
            >
              <h2>
                {editando ? 'Editar' : 'Novo'} — {titulo}
              </h2>
              <div className="modal-janela-botoes">
                <button
                  type="button"
                  className="janela-btn"
                  title={minimizado ? 'Restaurar' : 'Minimizar'}
                  onClick={() => setMinimizado((m) => !m)}
                >
                  {minimizado ? <IconWindowMaximize size={15} /> : <IconMinus size={15} />}
                </button>
                <button
                  type="button"
                  className="janela-btn"
                  title={maximizado ? 'Restaurar' : 'Maximizar'}
                  onClick={() => {
                    setMinimizado(false);
                    setMaximizado((m) => !m);
                  }}
                >
                  {maximizado ? <IconWindowMinimize size={15} /> : <IconWindowMaximize size={15} />}
                </button>
                <button
                  type="button"
                  className="janela-btn fechar"
                  title="Fechar"
                  onClick={fechar}
                >
                  <IconX size={15} />
                </button>
              </div>
            </div>
            <div className="modal-corpo">
              {campos.map((campo) => (
              <div className="campo-form" key={campo.name}>
                <label>
                  {campo.label}
                  {campo.obrigatorio ? ' *' : ''}
                </label>
                {campo.type === 'textarea' ? (
                  <textarea
                    value={String(formData[campo.name] ?? '')}
                    onChange={(e) => atualizarCampo(campo, e.target.value)}
                  />
                ) : campo.type === 'select' ? (
                  <select
                    value={String(formData[campo.name] ?? '')}
                    onChange={(e) => atualizarCampo(campo, e.target.value)}
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
                    onChange={(e) => atualizarCampo(campo, e.target.checked)}
                  />
                ) : (
                  <input
                    type={campo.type}
                    value={String(formData[campo.name] ?? '')}
                    onChange={(e) => atualizarCampo(campo, e.target.value)}
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
        </div>
      )}
    </div>
  );
}
