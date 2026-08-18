import { useState } from 'react';
import { normalizarBusca } from '../../lib/normalizarBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { useRascunhoDeTela } from '../../lib/useRascunhoDeTela';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { ComboboxBusca } from '../../components/ComboboxBusca';

interface ContaReceber {
  id: number;
  numero_conta: string;
  orcamento_id: number | null;
  cliente_id: number | null;
  descricao: string | null;
  valor: number;
  data_vencimento: string;
  data_recebimento: string | null;
  forma_recebimento: string | null;
  status: string;
  observacoes: string | null;
}

const STATUS_OPCOES = ['Em aberto', 'Recebido', 'Cancelado'];

async function gerarNumeroConta(): Promise<string> {
  return gerarNumeroSequencial('CR', 'contas_receber', 'numero_conta');
}

const formVazio = {
  cliente_id: '',
  descricao: '',
  valor: '',
  data_vencimento: '',
  observacoes: '',
};

export function ContasReceber() {
  const qc = useQueryClient();
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, string>>({});

  const { minimizar: minimizarRascunho } = useRascunhoDeTela('contas-receber', {
    titulo: 'Novo lançamento (conta a receber)',
    obterEstado: () => ({ form }),
    aoRestaurar: (e) => {
      setForm((e.form as typeof formVazio) ?? formVazio);
      setErro(null);
      setModalAberto(true);
    },
  });

  function minimizarConta() {
    minimizarRascunho();
    setModalAberto(false);
  }

  const query = useQuery({
    queryKey: ['contas-receber'],
    queryFn: async (): Promise<ContaReceber[]> => {
      const { data, error } = await supabase.from('contas_receber').select('*').order('data_vencimento');
      if (error) throw error;
      return data as ContaReceber[];
    },
  });

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-contas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  function nomeCliente(id: number | null) {
    return id ? clientesQuery.data?.find((c) => c.id === id)?.razao_social ?? `#${id}` : '-';
  }

  function statusExibicao(c: ContaReceber): { texto: string; tono: 'copper' | 'teal' | 'danger' | 'neutro' } {
    if (c.status === 'Recebido') return { texto: 'Recebido', tono: 'teal' };
    if (c.status === 'Cancelado') return { texto: 'Cancelado', tono: 'neutro' };
    const vencida = new Date(c.data_vencimento + 'T00:00:00') < new Date(new Date().toDateString());
    return vencida ? { texto: 'Vencida', tono: 'danger' } : { texto: 'Em aberto', tono: 'copper' };
  }

  function abrirNova() {
    setForm(formVazio);
    setErro(null);
    setModalAberto(true);
  }

  async function salvar() {
    setErro(null);
    if (!form.cliente_id) {
      setErro('Selecione o cliente.');
      return;
    }
    if (!form.valor || Number(form.valor) <= 0) {
      setErro('Informe um valor válido.');
      return;
    }
    if (!form.data_vencimento) {
      setErro('Informe a data de vencimento.');
      return;
    }
    setSalvando(true);
    try {
      const numero = await gerarNumeroConta();
      const { error } = await supabase.from('contas_receber').insert({
        numero_conta: numero,
        cliente_id: Number(form.cliente_id),
        descricao: form.descricao || null,
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento,
        observacoes: form.observacoes || null,
        status: 'Em aberto',
      });
      if (error) throw error;
      setModalAberto(false);
      qc.invalidateQueries({ queryKey: ['contas-receber'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(c: ContaReceber, novoStatus: string) {
    const { error } = await supabase
      .from('contas_receber')
      .update({
        status: novoStatus,
        data_recebimento: novoStatus === 'Recebido' ? new Date().toISOString().slice(0, 10) : c.data_recebimento,
      })
      .eq('id', c.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['contas-receber'] });
  }

  async function excluir(id: number, numero: string) {
    if (!confirm(`Excluir a conta ${numero}?`)) return;
    const { error } = await supabase.from('contas_receber').delete().eq('id', id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['contas-receber'] });
  }

  // Fica ANTES do "if isLoading" porque useLinhasOrdenadas é um hook - não
  // pode ser chamado condicionalmente.
  function valorColuna(c: ContaReceber, chave: string): unknown {
    if (chave === 'cliente') return nomeCliente(c.cliente_id);
    if (chave === 'data_vencimento') return c.data_vencimento;
    if (chave === 'status') return statusExibicao(c).texto;
    return (c as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (query.data ?? []).filter((c) => {
    const ativos = Object.entries(filtrosColuna).filter(([, v]) => v.trim());
    return ativos.every(([chave, termo]) =>
      normalizarBusca(String(valorColuna(c, chave) ?? '')).includes(normalizarBusca(termo.trim())),
    );
  });
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  if (query.isLoading || clientesQuery.isLoading) return <CarregandoTela />;

  const totalEmAberto = (query.data ?? [])
    .filter((c) => c.status === 'Em aberto')
    .reduce((soma, c) => soma + Number(c.valor), 0);

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Contas a receber</h1>
        <button className="botao-primario botao-pequeno" onClick={abrirNova}>
          <IconPlus size={16} /> Novo lançamento
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Contas de orçamentos aprovados são lançadas automaticamente aqui. Total em aberto: R$ {totalEmAberto.toFixed(2)}
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['numero_conta', 'Nº conta'],
              ['cliente', 'Cliente'],
              ['descricao', 'Descrição'],
              ['valor', 'Valor'],
              ['data_vencimento', 'Vencimento'],
              ['status', 'Status'],
            ].map(([chave, label]) => (
              <ThOrdenavel key={chave} chave={chave} colunaAtiva={coluna} direcao={direcao} onClick={ordenarPor}>
                {label}
              </ThOrdenavel>
            ))}
            <th></th>
          </tr>
          <tr>
            {['numero_conta', 'cliente', 'descricao', 'valor', 'data_vencimento', 'status'].map((chave) => (
              <th key={chave} style={{ padding: '2px 6px' }}>
                <input
                  type="text"
                  className="campo-filtro-coluna"
                  placeholder="Filtrar..."
                  value={filtrosColuna[chave] ?? ''}
                  onChange={(e) => setFiltrosColuna((f) => ({ ...f, [chave]: e.target.value }))}
                />
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => {
            const st = statusExibicao(c);
            return (
              <tr key={c.id}>
                <td className="mono">{c.numero_conta}</td>
                <td>{nomeCliente(c.cliente_id)}</td>
                <td>{c.descricao}</td>
                <td>R$ {Number(c.valor).toFixed(2)}</td>
                <td>{new Date(c.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td>
                  <select value={c.status} onChange={(e) => mudarStatus(c, e.target.value)} style={{ marginRight: 6 }}>
                    {STATUS_OPCOES.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  <Badge tono={st.tono}>{st.texto}</Badge>
                </td>
                <td className="acoes-tabela">
                  <button className="botao-icone perigo" title="Excluir" onClick={() => excluir(c.id, c.numero_conta)}>
                    <IconTrash size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhuma conta encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <ModalJanela
          titulo="Novo lançamento (conta a receber)"
          aoFechar={() => setModalAberto(false)}
          aoMinimizar={minimizarConta}
        >
            <div className="campo-form">
              <label>Cliente *</label>
              <ComboboxBusca
                opcoes={(clientesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.razao_social }))}
                valor={String(form.cliente_id ?? '')}
                onChange={(valor) => setForm((f) => ({ ...f, cliente_id: valor }))}
              />
            </div>
            <div className="campo-form">
              <label>Descrição</label>
              <textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>Valor (R$) *</label>
              <input type="number" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>Data de vencimento *</label>
              <input
                type="date"
                value={form.data_vencimento}
                onChange={(e) => setForm((f) => ({ ...f, data_vencimento: e.target.value }))}
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
