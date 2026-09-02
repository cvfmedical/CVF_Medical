import { isValidElement, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IconPlus, IconPencil, IconTrash, IconFileTypePdf } from '@tabler/icons-react';
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
import { exportarTabelaPdf } from '../lib/exportarPdf';
import { formatarMoeda } from '../lib/formato';

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
  // Só pra type 'combobox' cujo valor é o próprio texto (não um id de
  // outra tabela) - permite digitar uma opção nova que não está na lista
  // fixa, em vez de só escolher entre as existentes.
  permiteNovo?: boolean;
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
  // Rótulo mostrado no dropdown "estilo Excel" do filtro de coluna, quando
  // o valor cru da linha não é auto-explicativo (ex: campo timestamp cujo
  // `render` mostra um Badge "Aguardando" quando vazio, em vez da data).
  // Sem isso, cai no formatarValorParaFiltro (detecta data/timestamp ISO).
  rotuloFiltro?: (row: Row) => string;
  // Valor usado pra filtrar/agrupar esta coluna, quando `chave` não é um
  // campo de verdade da linha (ex: coluna derivada por lookup, tipo
  // "Cliente" via porId(ordem_servico_id)) - sem isso o filtro compara
  // contra `linha[chave]`, que fica undefined e nunca bate com nada.
  valorFiltro?: (row: Row) => unknown;
  // Texto usado na exportação em PDF, quando `render` devolve um JSX
  // complexo demais pra extrair um texto simples automaticamente (ex:
  // ícones, múltiplos elementos). Sem isso, tenta extrair o texto do
  // `render` (ou o valor cru da linha) - ver `textoColunaPdf`.
  textoPdf?: (row: Row) => string;
}

// Extrai um texto simples de uma coluna pra exportação em PDF: usa
// `textoPdf` se veio explícito; senão tenta puxar do que `render` devolve
// (string/number direto, ou os filhos de um elemento simples tipo
// <Badge>texto</Badge>); na falta de tudo isso, cai no valor cru da linha.
function textoColunaPdf<Row>(col: ColunaConfig<Row>, row: Row): string {
  if (col.textoPdf) return col.textoPdf(row);
  if (col.render) {
    const valor = col.render(row);
    if (typeof valor === 'string' || typeof valor === 'number') return String(valor);
    if (isValidElement(valor)) {
      const filhos = (valor.props as { children?: unknown }).children;
      if (typeof filhos === 'string' || typeof filhos === 'number') return String(filhos);
      if (Array.isArray(filhos)) {
        return filhos.filter((f) => typeof f === 'string' || typeof f === 'number').join('');
      }
    }
  }
  return String((row as Record<string, unknown>)[col.chave] ?? '');
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
  // Botão(ões) extra(s) no rodapé do formulário (Novo/Editar), antes de
  // Cancelar/Salvar - ex: "Imprimir etiqueta" em Entrega.tsx, pra imprimir
  // sem precisar sair do formulário e sem depender de lembrar de fazer
  // isso antes de salvar (o que muda o status e tira a OS da fila).
  acoesFormularioExtras?: (formData: Record<string, unknown>) => React.ReactNode;
  // Bloco de resumo (ex: totais por categoria) entre o cabeçalho e a
  // tabela - recebe todas as linhas (sem filtro), mesmo padrão do "Total
  // em aberto" já usado em Contas a Receber.
  resumo?: (todasAsLinhas: Row[]) => React.ReactNode;
  // "Exportar PDF" no cabeçalho, com as linhas filtradas/ordenadas
  // visíveis na tela. Ligado por padrão em toda tela baseada em CrudPage;
  // passe `false` só se a tabela não fizer sentido impressa (ex: muitas
  // colunas com HTML complexo sem `textoPdf`).
  permitirExportarPdf?: boolean;
  // Substitui o que o botão "+ Novo" faz (em vez de abrir o formulário
  // genérico já preenchido com `valorInicial`) - útil quando "criar um
  // registro novo" precisa de um modal próprio, com campos que o
  // formulário genérico não modela (ex: alternar entre lançamento único e
  // parcelado em Contas a pagar/receber). Não afeta "Editar" - continua
  // usando o formulário genérico normalmente.
  aoClicarNovo?: () => void;
  // Filtro "Período" (De/Até) por uma coluna de data (formato YYYY-MM-DD)
  // no cabeçalho, além dos filtros por coluna já existentes - útil pra
  // telas de lançamento (ex: Contas a pagar, por data_vencimento).
  // `campoValor`, quando informado, soma esse campo numérico das linhas
  // filtradas e mostra "Total filtrado" logo abaixo do cabeçalho.
  filtroPeriodo?: { campo: string; label?: string; campoValor?: string };
  // Esconde certas linhas por padrão (ex: entregas já finalizadas) sem
  // misturar com os filtros por coluna - aparece um checkbox "Mostrar
  // {rotulo} (consulta)" que reexibe quando marcado. Tudo client-side,
  // não refaz a query nem afeta `resumo` (que sempre recebe todas as
  // linhas) - mesmo espírito do "Mostrar já faturados" já usado em
  // Faturamento.tsx, só que reutilizável por qualquer tela CrudPage.
  ocultarPorPadrao?: { linhaOculta: (row: Row) => boolean; rotulo: string };
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
  acoesFormularioExtras,
  resumo,
  permitirExportarPdf = true,
  aoClicarNovo,
  filtroPeriodo,
  ocultarPorPadrao,
}: CrudPageProps<Row>) {
  const { listQuery, criar, atualizar, excluir } = useCrud<Row>(tabela, ordenarPor);
  const location = useLocation();
  const { minimizar, rascunhos, pedidoRestauracao, fecharRascunho, limparPedido } = useRascunhos();
  // Filtro por coluna (um campo de busca embaixo de cada cabeçalho, mais o
  // dropdown "estilo Excel" de valores exatos) - substituiu a busca única
  // genérica; `camposFiltro` não é mais usado pra filtrar, mas continua
  // aceito na prop por compatibilidade com quem ainda passa.
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();
  const [editando, setEditando] = useState<Row | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [periodoDe, setPeriodoDe] = useState('');
  const [periodoAte, setPeriodoAte] = useState('');
  const [mostrarOcultos, setMostrarOcultos] = useState(false);

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
    return todas.filter((linha) => {
      if (ocultarPorPadrao && !mostrarOcultos && ocultarPorPadrao.linhaOculta(linha)) return false;
      const passaColunas = colunas.every((c) =>
        passaFiltro(c.valorFiltro ? c.valorFiltro(linha) : (linha as Record<string, unknown>)[c.chave], c.chave),
      );
      if (!passaColunas) return false;
      if (filtroPeriodo && (periodoDe || periodoAte)) {
        const valor = (linha as Record<string, unknown>)[filtroPeriodo.campo];
        if (typeof valor !== 'string') return false;
        if (periodoDe && valor < periodoDe) return false;
        if (periodoAte && valor > periodoAte) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.data, filtrosColuna, filtrosValores, colunas, filtroPeriodo, periodoDe, periodoAte, ocultarPorPadrao, mostrarOcultos]);

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

  const [exportandoPdf, setExportandoPdf] = useState(false);
  async function handleExportarPdf() {
    setExportandoPdf(true);
    try {
      await exportarTabelaPdf({
        titulo,
        colunas: colunas.map((c) => ({ label: c.label })),
        linhas: linhas.map((row) => colunas.map((c) => textoColunaPdf(c, row))),
        nomeArquivo: titulo,
      });
    } catch (e) {
      alert(mensagemErro(e));
    } finally {
      setExportandoPdf(false);
    }
  }

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>{titulo}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {filtroPeriodo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--ink-400)' }}>{filtroPeriodo.label ?? 'Período'}:</span>
                <input type="date" value={periodoDe} onChange={(e) => setPeriodoDe(e.target.value)} style={{ width: 140 }} />
                <span style={{ color: 'var(--ink-400)' }}>até</span>
                <input type="date" value={periodoAte} onChange={(e) => setPeriodoAte(e.target.value)} style={{ width: 140 }} />
              </div>
              {filtroPeriodo.campoValor && !listQuery.isLoading && !listQuery.isError && (
                <span style={{ fontSize: 13, color: 'var(--copper-500)', fontWeight: 600 }}>
                  Total filtrado: {formatarMoeda(linhasFiltradas.reduce((s, l) => s + Number((l as Record<string, unknown>)[filtroPeriodo.campoValor!] ?? 0), 0))}{' '}
                  ({linhasFiltradas.length} registro{linhasFiltradas.length === 1 ? '' : 's'})
                </span>
              )}
            </div>
          )}
          {ocultarPorPadrao && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={mostrarOcultos} onChange={(e) => setMostrarOcultos(e.target.checked)} />
              Mostrar {ocultarPorPadrao.rotulo} (consulta)
            </label>
          )}
          {(algumFiltroAtivo || periodoDe || periodoAte) && (
            <button
              className="botao-secundario botao-pequeno"
              onClick={() => {
                limparTudo();
                setPeriodoDe('');
                setPeriodoAte('');
              }}
            >
              Limpar filtros
            </button>
          )}
          {permitirExportarPdf && (
            <button className="botao-secundario botao-pequeno" onClick={handleExportarPdf} disabled={exportandoPdf}>
              <IconFileTypePdf size={16} /> {exportandoPdf ? 'Gerando PDF...' : 'Exportar PDF'}
            </button>
          )}
          <button className="botao-primario botao-pequeno" onClick={aoClicarNovo ?? abrirNovo}>
            <IconPlus size={16} /> Novo
          </button>
        </div>
      </div>

      {resumo && !listQuery.isLoading && !listQuery.isError && resumo(listQuery.data ?? [])}

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
                const valorColuna = (linha: Row) =>
                  c.valorFiltro ? c.valorFiltro(linha) : (linha as Record<string, unknown>)[c.chave];
                const valoresDisponiveis = Array.from(
                  new Set((listQuery.data ?? []).map((linha) => String(valorColuna(linha) ?? ''))),
                ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
                const rotulos = c.rotuloFiltro
                  ? Object.fromEntries((listQuery.data ?? []).map((linha) => [String(valorColuna(linha) ?? ''), c.rotuloFiltro!(linha)]))
                  : undefined;
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
                        rotulos={rotulos}
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
                (() => {
                  const opcoesBase = normalizarOpcoes(campo.opcoes);
                  const valorAtual = String(formData[campo.name] ?? '');
                  // Com permiteNovo, o valor pode ser um texto digitado que não
                  // está na lista fixa - inclui ele como opção pra continuar
                  // aparecendo selecionado (senão o combobox mostra vazio).
                  const opcoesFinal =
                    campo.permiteNovo && valorAtual && !opcoesBase.some((o) => o.value === valorAtual)
                      ? [...opcoesBase, { value: valorAtual, label: valorAtual }]
                      : opcoesBase;
                  return (
                    <ComboboxBusca
                      opcoes={opcoesFinal}
                      valor={valorAtual}
                      onChange={(valor) => atualizarCampo(campo, valor)}
                      aoCriarNovo={campo.permiteNovo ? (texto) => atualizarCampo(campo, texto) : undefined}
                      textoCriarNovo="Usar"
                    />
                  );
                })()
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
            {acoesFormularioExtras?.(formData)}
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
