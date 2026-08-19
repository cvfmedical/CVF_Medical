import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { useCrud } from '../lib/useCrud';
import { mensagemErro } from '../lib/erros';
import { useRascunhos } from '../contexts/RascunhosContext';
import { ModalJanela } from './ModalJanela';
import { CarregandoTela } from './CarregandoTela';
import { ComboboxBusca } from './ComboboxBusca';
import { ThOrdenavel } from './ThOrdenavel';
import { useLinhasOrdenadas } from '../lib/useOrdenacao';
import { useFiltrosColuna } from '../lib/useFiltrosColuna';
import { FiltroColunaValores } from './FiltroColunaValores';

export type TipoCampo = 'text' | 'number' | 'textarea' | 'select' | 'combobox' | 'checkbox' | 'date';

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
  // string: nome de uma coluna da própria linha. Função: valor derivado
  // (ex: número da OS via lookup por ordem_servico_id) - útil quando a
  // tabela só guarda o id, não o texto que faz sentido buscar.
  camposFiltro?: (string | ((row: Row) => string))[];
  valorInicial?: Record<string, unknown>;
  validar?: (dados: Record<string, unknown>) => string | null;
  antesDeEnviar?: (dados: Record<string, unknown>) => Record<string, unknown>;
  // Efeito colateral pós-salvar (ex: telas de teste que precisam voltar o
  // status da OS para "Em Manutenção" quando o resultado é reprovado).
  aposSalvar?: (dadosEnviados: Record<string, unknown>) => Promise<void>;
  // Botões extras na linha da tabela, antes de Editar/Excluir (ex:
  // "Imprimir etiqueta" em Entrega.tsx).
  acoesExtras?: (row: Row) => React.ReactNode;
}

export function CrudPage<Row extends { id: number }>({
  titulo,
  tabela,
  colunas,
  campos,
  ordenarPor = 'id',
  valorInicial = {},
  validar,
  antesDeEnviar,
  aposSalvar,
  acoesExtras,
}: CrudPageProps<Row>) {
  const { listQuery, criar, atualizar, excluir } = useCrud<Row>(tabela, ordenarPor);
  const location = useLocation();
  const { minimizar, rascunhos, pedidoRestauracao, fecharRascunho, limparPedido } = useRascunhos();
  // Filtro por coluna (um campo de busca embaixo de cada cabeçalho, mais o
  // dropdown "estilo Excel" de valores exatos) - substituiu a busca única
  // genérica; `camposFiltro` não é mais usado pra filtrar, mas continua
  // aceito na prop por compatibilidade com quem ainda passa.
  const { textos: filtrosColuna, setTexto: setFiltroTexto, valores: filtrosValores, setValoresColuna, passaFiltro } = useFiltrosColuna();
  const [editando, setEditando] = useState<Row | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
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

  const linhasFiltradas = useMemo(() => {
    const todas = listQuery.data ?? [];
    return todas.filter((linha) =>
      colunas.every((c) => passaFiltro((linha as Record<string, unknown>)[c.chave], c.chave)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.data, filtrosColuna, filtrosValores, colunas]);

  const { linhasOrdenadas: linhas, coluna: colunaOrdenada, direcao, ordenarPor: ordenarPorColuna } = useLinhasOrdenadas(linhasFiltradas);

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

  // Minimizar: guarda o rascunho (com o registro em edição) no contexto global
  // e fecha o modal local. Ele sobrevive à navegação entre telas.
  function minimizarFormulario() {
    minimizar({
      tabela,
      titulo: `${editando ? 'Editar' : 'Novo'} — ${titulo}`,
      rota: location.pathname + location.search,
      formData,
      editando,
    });
    setModalAberto(false);
  }

  // Restaurar: quando a barra pede este rascunho, reabre com os dados.
  useEffect(() => {
    if (pedidoRestauracao !== tabela) return;
    const r = rascunhos.find((x) => x.tabela === tabela);
    if (r) {
      setEditando((r.editando as Row | null) ?? null);
      setFormData(r.formData);
      setErro(null);
      setModalAberto(true);
      fecharRascunho(tabela);
    }
    limparPedido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoRestauracao]);

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

      {listQuery.isLoading && <CarregandoTela />}
      {listQuery.isError && <p className="erro-login">{mensagemErro(listQuery.error)}</p>}

      {!listQuery.isLoading && !listQuery.isError && (
        <table className="tabela-crud">
          <thead>
            <tr>
              {colunas.map((c) => (
                <ThOrdenavel key={c.chave} chave={c.chave} colunaAtiva={colunaOrdenada} direcao={direcao} onClick={ordenarPorColuna}>
                  {c.label}
                </ThOrdenavel>
              ))}
              <th></th>
            </tr>
            <tr>
              {colunas.map((c) => {
                const valoresDisponiveis = Array.from(
                  new Set((listQuery.data ?? []).map((linha) => String((linha as Record<string, unknown>)[c.chave] ?? ''))),
                ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
                return (
                  <th key={c.chave} style={{ padding: '2px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="campo-filtro-coluna"
                        placeholder="Filtrar..."
                        value={filtrosColuna[c.chave] ?? ''}
                        onChange={(e) => setFiltroTexto(c.chave, e.target.value)}
                      />
                      <FiltroColunaValores
                        valores={valoresDisponiveis}
                        selecionados={filtrosValores[c.chave] ?? new Set()}
                        onChange={(v) => setValoresColuna(c.chave, v)}
                      />
                    </div>
                  </th>
                );
              })}
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
                  {acoesExtras?.(row)}
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
        <ModalJanela
          titulo={`${editando ? 'Editar' : 'Novo'} — ${titulo}`}
          aoFechar={fechar}
          aoMinimizar={minimizarFormulario}
        >
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
              ) : campo.type === 'combobox' ? (
                <ComboboxBusca
                  opcoes={normalizarOpcoes(campo.opcoes)}
                  valor={String(formData[campo.name] ?? '')}
                  onChange={(valor) => atualizarCampo(campo, valor)}
                />
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
        </ModalJanela>
      )}
    </div>
  );
}
