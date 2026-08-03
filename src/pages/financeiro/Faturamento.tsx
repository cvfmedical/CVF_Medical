import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';

interface ContaReceber {
  id: number;
  numero_conta: string;
  cliente_id: number | null;
  descricao: string | null;
  valor: number;
  status: string;
  nf_tipo: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave_acesso: string | null;
  nf_data_emissao: string | null;
}

const formVazio = {
  nf_tipo: 'NFS-e',
  nf_numero: '',
  nf_serie: '',
  nf_chave_acesso: '',
  nf_data_emissao: '',
};

export function Faturamento() {
  const qc = useQueryClient();
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const query = useQuery({
    queryKey: ['faturamento-contas-receber'],
    queryFn: async (): Promise<ContaReceber[]> => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select('id, numero_conta, cliente_id, descricao, valor, status, nf_tipo, nf_numero, nf_serie, nf_chave_acesso, nf_data_emissao')
        .neq('status', 'Cancelado')
        .order('data_vencimento', { ascending: false });
      if (error) throw error;
      return data as ContaReceber[];
    },
  });

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-faturamento'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  function nomeCliente(id: number | null) {
    return id ? clientesQuery.data?.find((c) => c.id === id)?.razao_social ?? `#${id}` : '-';
  }

  function abrirLancarNota(c: ContaReceber) {
    setContaSelecionada(c);
    setForm({
      nf_tipo: c.nf_tipo ?? 'NFS-e',
      nf_numero: c.nf_numero ?? '',
      nf_serie: c.nf_serie ?? '',
      nf_chave_acesso: c.nf_chave_acesso ?? '',
      nf_data_emissao: c.nf_data_emissao ?? '',
    });
    setErro(null);
  }

  async function salvarNota() {
    if (!contaSelecionada) return;
    setErro(null);
    if (!form.nf_numero) {
      setErro('Informe o número da nota.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('contas_receber')
        .update({
          nf_tipo: form.nf_tipo,
          nf_numero: form.nf_numero,
          nf_serie: form.nf_serie || null,
          nf_chave_acesso: form.nf_chave_acesso || null,
          nf_data_emissao: form.nf_data_emissao || null,
        })
        .eq('id', contaSelecionada.id);
      if (error) throw error;
      setContaSelecionada(null);
      qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function removerNota(c: ContaReceber) {
    if (!confirm(`Remover os dados de nota fiscal de ${c.numero_conta}?`)) return;
    const { error } = await supabase
      .from('contas_receber')
      .update({ nf_tipo: null, nf_numero: null, nf_serie: null, nf_chave_acesso: null, nf_data_emissao: null })
      .eq('id', c.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
  }

  if (query.isLoading || clientesQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Faturamento (NF-e / NFS-e)</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Controle/registro apenas - a emissão da nota continua sendo feita fora do sistema (Mentora ou o site da
        prefeitura). Aqui só se anota os dados da nota já emitida, ligada à conta a receber correspondente.
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Nº conta</th>
            <th>Cliente</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Nota fiscal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(query.data ?? []).map((c) => (
            <tr key={c.id}>
              <td className="mono">{c.numero_conta}</td>
              <td>{nomeCliente(c.cliente_id)}</td>
              <td>{c.descricao}</td>
              <td>R$ {Number(c.valor).toFixed(2)}</td>
              <td>
                {c.nf_numero ? (
                  <>
                    <Badge tono="teal">Faturado</Badge>{' '}
                    <span className="mono" style={{ fontSize: 12 }}>
                      {c.nf_tipo} {c.nf_numero}
                      {c.nf_serie ? `/${c.nf_serie}` : ''}
                    </span>
                  </>
                ) : (
                  <Badge tono="copper">Não faturado</Badge>
                )}
              </td>
              <td className="acoes-tabela">
                <button className="botao-secundario" onClick={() => abrirLancarNota(c)}>
                  {c.nf_numero ? 'Editar NF' : 'Lançar NF'}
                </button>
                {c.nf_numero && (
                  <button className="botao-secundario perigo" onClick={() => removerNota(c)}>
                    Remover NF
                  </button>
                )}
              </td>
            </tr>
          ))}
          {(query.data ?? []).length === 0 && (
            <tr>
              <td colSpan={6}>Nenhuma conta a receber encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>

      {contaSelecionada && (
        <div className="modal-fundo" onClick={() => setContaSelecionada(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Lançar nota fiscal - {contaSelecionada.numero_conta}</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
              {nomeCliente(contaSelecionada.cliente_id)} - R$ {Number(contaSelecionada.valor).toFixed(2)}
            </p>

            <div className="campo-form">
              <label>Tipo</label>
              <select value={form.nf_tipo} onChange={(e) => setForm((f) => ({ ...f, nf_tipo: e.target.value }))}>
                <option value="NFS-e">NFS-e (serviço)</option>
                <option value="NF-e">NF-e (produto)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Número *</label>
                <input type="text" value={form.nf_numero} onChange={(e) => setForm((f) => ({ ...f, nf_numero: e.target.value }))} />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Série</label>
                <input type="text" value={form.nf_serie} onChange={(e) => setForm((f) => ({ ...f, nf_serie: e.target.value }))} />
              </div>
            </div>
            <div className="campo-form">
              <label>Chave de acesso</label>
              <input
                type="text"
                maxLength={44}
                value={form.nf_chave_acesso}
                onChange={(e) => setForm((f) => ({ ...f, nf_chave_acesso: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Data de emissão</label>
              <input
                type="date"
                value={form.nf_data_emissao}
                onChange={(e) => setForm((f) => ({ ...f, nf_data_emissao: e.target.value }))}
              />
            </div>

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setContaSelecionada(null)} disabled={salvando}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={salvarNota} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
