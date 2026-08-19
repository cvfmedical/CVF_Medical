import { useState } from 'react';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { useRascunhoDeTela } from '../../lib/useRascunhoDeTela';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { ComboboxBusca } from '../../components/ComboboxBusca';

interface SolicitacaoCompra {
  id: number;
  numero_solicitacao: string;
  produto_servico_id: number | null;
  descricao_item: string | null;
  quantidade: number;
  fornecedor_id: number | null;
  status: string;
  observacoes: string | null;
  data_solicitacao: string;
}

const STATUS_OPCOES = ['Solicitado', 'Aprovado', 'Pedido Realizado', 'Recebido', 'Cancelado'];

const TONO_STATUS: Record<string, 'copper' | 'teal' | 'danger' | 'neutro'> = {
  Solicitado: 'copper',
  Aprovado: 'neutro',
  'Pedido Realizado': 'neutro',
  Recebido: 'teal',
  Cancelado: 'danger',
};

async function gerarNumeroSolicitacao(): Promise<string> {
  return gerarNumeroSequencial('SOL', 'solicitacoes_compra', 'numero_solicitacao');
}

const formVazio = {
  produto_servico_id: '',
  descricao_item: '',
  quantidade: '1',
  fornecedor_id: '',
  observacoes: '',
};

const COLUNAS_FILTRAVEIS = ['numero_solicitacao', 'item', 'quantidade', 'fornecedor', 'status', 'data_solicitacao'];

export function SolicitacoesCompra() {
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { textos: filtrosColuna, setTexto: setFiltroTexto, valores: filtrosValores, setValoresColuna, passaFiltro } = useFiltrosColuna();

  const { minimizar: minimizarRascunho } = useRascunhoDeTela('solicitacoes-compra', {
    titulo: 'Nova solicitação de compra',
    obterEstado: () => ({ form }),
    aoRestaurar: (e) => {
      setForm((e.form as typeof formVazio) ?? formVazio);
      setErro(null);
      setModalAberto(true);
    },
  });

  function minimizarSolicitacao() {
    minimizarRascunho();
    setModalAberto(false);
  }

  const query = useQuery({
    queryKey: ['solicitacoes-compra'],
    queryFn: async (): Promise<SolicitacaoCompra[]> => {
      const { data, error } = await supabase
        .from('solicitacoes_compra')
        .select('*')
        .order('data_solicitacao', { ascending: false });
      if (error) throw error;
      return data as SolicitacaoCompra[];
    },
  });

  const produtosQuery = useQuery({
    queryKey: ['produtos-servicos-opcoes-compras'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos_servicos')
        .select('id, nome')
        .eq('status_ativo', true)
        .order('nome');
      if (error) throw error;
      return data as { id: number; nome: string }[];
    },
  });

  const fornecedoresQuery = useQuery({
    queryKey: ['fornecedores-opcoes-compras'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  function nomeItem(s: SolicitacaoCompra) {
    if (s.produto_servico_id) return produtosQuery.data?.find((p) => p.id === s.produto_servico_id)?.nome ?? `#${s.produto_servico_id}`;
    return s.descricao_item ?? '-';
  }

  function nomeFornecedor(id: number | null) {
    return id ? fornecedoresQuery.data?.find((f) => f.id === id)?.razao_social ?? `#${id}` : '-';
  }

  function abrirNova() {
    setForm(formVazio);
    setErro(null);
    setModalAberto(true);
  }

  async function salvar() {
    setErro(null);
    if (!form.produto_servico_id && !form.descricao_item) {
      setErro('Selecione um produto/peça ou descreva o item.');
      return;
    }
    if (!form.quantidade || Number(form.quantidade) <= 0) {
      setErro('Informe uma quantidade válida.');
      return;
    }
    setSalvando(true);
    try {
      const numero = await gerarNumeroSolicitacao();
      const { error } = await supabase.from('solicitacoes_compra').insert({
        numero_solicitacao: numero,
        produto_servico_id: form.produto_servico_id ? Number(form.produto_servico_id) : null,
        descricao_item: form.produto_servico_id ? null : form.descricao_item || null,
        quantidade: Number(form.quantidade),
        fornecedor_id: form.fornecedor_id ? Number(form.fornecedor_id) : null,
        observacoes: form.observacoes || null,
        status: 'Solicitado',
        solicitado_por: funcionario?.id ?? null,
      });
      if (error) throw error;
      setModalAberto(false);
      qc.invalidateQueries({ queryKey: ['solicitacoes-compra'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(id: number, novoStatus: string) {
    const { error } = await supabase.from('solicitacoes_compra').update({ status: novoStatus }).eq('id', id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['solicitacoes-compra'] });
    qc.invalidateQueries({ queryKey: ['produtos-estoque'] });
  }

  async function excluir(id: number, numero: string) {
    if (!confirm(`Excluir a solicitação ${numero}?`)) return;
    const { error } = await supabase.from('solicitacoes_compra').delete().eq('id', id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['solicitacoes-compra'] });
  }

  // Fica ANTES do "if isLoading" porque useLinhasOrdenadas é um hook - não
  // pode ser chamado condicionalmente.
  function valorColuna(s: SolicitacaoCompra, chave: string): unknown {
    if (chave === 'item') return nomeItem(s);
    if (chave === 'fornecedor') return nomeFornecedor(s.fornecedor_id);
    if (chave === 'data_solicitacao') return s.data_solicitacao;
    return (s as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (query.data ?? []).filter((s) =>
    COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(s, chave), chave)),
  );
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  if (query.isLoading || produtosQuery.isLoading || fornecedoresQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Solicitação de compras</h1>
        <button className="botao-primario botao-pequeno" onClick={abrirNova}>
          <IconPlus size={16} /> Nova solicitação
        </button>
      </div>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['numero_solicitacao', 'Nº solicitação'],
              ['item', 'Item'],
              ['quantidade', 'Quantidade'],
              ['fornecedor', 'Fornecedor'],
              ['status', 'Status'],
              ['data_solicitacao', 'Data'],
            ].map(([chave, label]) => (
              <ThOrdenavel key={chave} chave={chave} colunaAtiva={coluna} direcao={direcao} onClick={ordenarPor}>
                {label}
              </ThOrdenavel>
            ))}
            <th></th>
          </tr>
          <tr>
            {COLUNAS_FILTRAVEIS.map((chave) => {
              const valoresDisponiveis = Array.from(
                new Set((query.data ?? []).map((s) => String(valorColuna(s, chave) ?? ''))),
              ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
              return (
                <th key={chave} style={{ padding: '2px 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="campo-filtro-coluna"
                      placeholder="Filtrar..."
                      value={filtrosColuna[chave] ?? ''}
                      onChange={(e) => setFiltroTexto(chave, e.target.value)}
                    />
                    <FiltroColunaValores
                      valores={valoresDisponiveis}
                      selecionados={filtrosValores[chave] ?? new Set()}
                      onChange={(v) => setValoresColuna(chave, v)}
                    />
                  </div>
                </th>
              );
            })}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((s) => (
            <tr key={s.id}>
              <td className="mono">{s.numero_solicitacao}</td>
              <td>{nomeItem(s)}</td>
              <td>{s.quantidade}</td>
              <td>{nomeFornecedor(s.fornecedor_id)}</td>
              <td>
                <select value={s.status} onChange={(e) => mudarStatus(s.id, e.target.value)}>
                  {STATUS_OPCOES.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                <Badge tono={TONO_STATUS[s.status] ?? 'neutro'}>{s.status}</Badge>
              </td>
              <td>{new Date(s.data_solicitacao).toLocaleDateString('pt-BR')}</td>
              <td className="acoes-tabela">
                <button className="botao-icone perigo" title="Excluir" onClick={() => excluir(s.id, s.numero_solicitacao)}>
                  <IconTrash size={16} />
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhuma solicitação encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <ModalJanela
          titulo="Nova solicitação de compra"
          aoFechar={() => setModalAberto(false)}
          aoMinimizar={minimizarSolicitacao}
        >

            <div className="campo-form">
              <label>Produto/peça já cadastrado (opcional)</label>
              <ComboboxBusca
                opcoes={(produtosQuery.data ?? []).map((p) => ({ value: String(p.id), label: p.nome }))}
                valor={String(form.produto_servico_id ?? '')}
                onChange={(valor) => setForm((f) => ({ ...f, produto_servico_id: valor }))}
              />
            </div>
            {!form.produto_servico_id && (
              <div className="campo-form">
                <label>Ou descreva o item (ainda não cadastrado)</label>
                <textarea
                  value={form.descricao_item}
                  onChange={(e) => setForm((f) => ({ ...f, descricao_item: e.target.value }))}
                />
              </div>
            )}
            <div className="campo-form">
              <label>Quantidade *</label>
              <input type="number" value={form.quantidade} onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>Fornecedor (opcional)</label>
              <ComboboxBusca
                opcoes={(fornecedoresQuery.data ?? []).map((f) => ({ value: String(f.id), label: f.razao_social }))}
                valor={String(form.fornecedor_id ?? '')}
                onChange={(valor) => setForm((f) => ({ ...f, fornecedor_id: valor }))}
              />
            </div>
            <div className="campo-form">
              <label>Observações</label>
              <textarea value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setModalAberto(false)} disabled={salvando}>
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
