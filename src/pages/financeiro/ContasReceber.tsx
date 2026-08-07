import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { IconPlus, IconTrash } from '@tabler/icons-react';

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
            <th>Nº conta</th>
            <th>Cliente</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(query.data ?? []).map((c) => {
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
          {(query.data ?? []).length === 0 && (
            <tr>
              <td colSpan={7}>Nenhuma conta encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <div className="modal-fundo" onClick={() => setModalAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Novo lançamento (conta a receber)</h2>
            <div className="campo-form">
              <label>Cliente *</label>
              <select value={form.cliente_id} onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {(clientesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razao_social}
                  </option>
                ))}
              </select>
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
          </div>
        </div>
      )}
    </div>
  );
}
