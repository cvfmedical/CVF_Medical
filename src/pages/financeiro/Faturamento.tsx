import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { linkEmail } from '../../lib/compartilhar';
import { STATUS_PRONTO_ENTREGA } from '../../lib/statusOS';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';

const STATUS_ENTREGUE = '11. ENTREGUE AO CLIENTE';

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
  orcamentos: { ordem_servico_id: number; ordens_servico: { status_os: string | null } | null } | null;
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
        .select(
          'id, numero_conta, cliente_id, descricao, valor, status, nf_tipo, nf_numero, nf_serie, nf_chave_acesso, nf_data_emissao, orcamentos(ordem_servico_id, ordens_servico(status_os))',
        )
        .neq('status', 'Cancelado')
        .order('data_vencimento', { ascending: false });
      if (error) throw error;
      return data as unknown as ContaReceber[];
    },
  });

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-faturamento'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social, email');
      if (error) throw error;
      return data as { id: number; razao_social: string; email: string | null }[];
    },
  });

  function liberadaParaFaturar(c: ContaReceber): boolean {
    const statusOS = c.orcamentos?.ordens_servico?.status_os;
    return !c.nf_numero && (statusOS === STATUS_PRONTO_ENTREGA || statusOS === STATUS_ENTREGUE);
  }

  const liberadas = (query.data ?? []).filter(liberadaParaFaturar);

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

  // mailto: não anexa arquivo - igual a todo resto do sistema (WhatsApp/
  // e-mail em outras telas), quem envia precisa anexar o PDF da nota,
  // laudo e boleto manualmente no próprio cliente de e-mail.
  function enviarPorEmail(c: ContaReceber) {
    const email = clientesQuery.data?.find((cl) => cl.id === c.cliente_id)?.email;
    const corpo = `Olá! Segue a nota fiscal ${c.nf_tipo ?? ''} ${c.nf_numero ?? ''}${c.nf_serie ? '/' + c.nf_serie : ''} referente a "${c.descricao ?? c.numero_conta}". Anexamos o PDF da nota (e do laudo/boleto, quando aplicável) a este e-mail.`;
    window.open(linkEmail(email, `Q-CVF Medical - Nota fiscal ${c.nf_numero ?? ''}`, corpo), '_blank');
  }

  if (query.isLoading || clientesQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Faturamento (NF-e / NFS-e)</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Controle/registro apenas - a emissão da nota continua sendo feita fora do sistema (Mentora ou o site da
        prefeitura). Aqui só se anota os dados da nota já emitida, ligada à conta a receber correspondente.
      </p>

      {liberadas.length > 0 && (
        <div
          style={{
            background: 'var(--paper-50)',
            border: '1px solid var(--copper-500)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {liberadas.length} conta{liberadas.length > 1 ? 's' : ''} liberada{liberadas.length > 1 ? 's' : ''} para
          faturamento (equipamento pronto/entregue, sem NF lançada).
        </div>
      )}

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
                ) : liberadaParaFaturar(c) ? (
                  <Badge tono="copper">Liberado</Badge>
                ) : (
                  <Badge tono="neutro">Não faturado</Badge>
                )}
              </td>
              <td className="acoes-tabela">
                <button className="botao-secundario" onClick={() => abrirLancarNota(c)}>
                  {c.nf_numero ? 'Editar NF' : 'Lançar NF'}
                </button>
                {c.nf_numero && (
                  <button className="botao-secundario" onClick={() => enviarPorEmail(c)}>
                    Enviar por e-mail
                  </button>
                )}
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
