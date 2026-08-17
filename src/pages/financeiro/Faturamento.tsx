import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { linkEmail } from '../../lib/compartilhar';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { STATUS_PRONTO_ENTREGA } from '../../lib/statusOS';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';

const STATUS_ENTREGUE = '11. ENTREGUE AO CLIENTE';

interface ContaReceber {
  id: number;
  numero_conta: string;
  orcamento_id: number | null;
  cliente_id: number | null;
  descricao: string | null;
  valor: number;
  status: string;
  nf_tipo: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave_acesso: string | null;
  nf_data_emissao: string | null;
  boleto_numero: string | null;
  boleto_linha_digitavel: string | null;
  boleto_vencimento: string | null;
}

interface OrcamentoAprovado {
  id: number;
  numero_orcamento: string;
  ordem_servico_id: number;
  ordens_servico: { numero_os: string; cliente_id: number; cliente_nome: string; status_os: string | null } | null;
  orcamento_itens: { preco_unitario: number | null; quantidade: number }[];
}

// Linha unificada da tabela: ou já existe uma conta a receber lançada
// (contaId preenchido), ou é um orçamento aprovado que ainda não tem NF/
// conta nenhuma (contaId nulo - "Lançar NF" cria a conta a receber nessa
// hora, com os dados de NF/boleto de uma vez só).
interface LinhaFaturamento {
  chave: string;
  contaId: number | null;
  orcamentoId: number | null;
  numero: string;
  clienteId: number | null;
  descricao: string;
  valor: number;
  statusOS: string | null;
  nf_tipo: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave_acesso: string | null;
  nf_data_emissao: string | null;
  boleto_numero: string | null;
  boleto_linha_digitavel: string | null;
  boleto_vencimento: string | null;
}

const formVazio = {
  nf_tipo: 'NFS-e',
  nf_numero: '',
  nf_serie: '',
  nf_chave_acesso: '',
  nf_data_emissao: '',
  boleto_numero: '',
  boleto_linha_digitavel: '',
  boleto_vencimento: '',
};

function liberada(statusOS: string | null): boolean {
  return statusOS === STATUS_PRONTO_ENTREGA || statusOS === STATUS_ENTREGUE;
}

export function Faturamento() {
  const qc = useQueryClient();
  const [linhaSelecionada, setLinhaSelecionada] = useState<LinhaFaturamento | null>(null);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const contasQuery = useQuery({
    queryKey: ['faturamento-contas-receber'],
    queryFn: async (): Promise<ContaReceber[]> => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select(
          'id, numero_conta, orcamento_id, cliente_id, descricao, valor, status, nf_tipo, nf_numero, nf_serie, nf_chave_acesso, nf_data_emissao, boleto_numero, boleto_linha_digitavel, boleto_vencimento',
        )
        .neq('status', 'Cancelado')
        .order('id', { ascending: false });
      if (error) throw error;
      return data as unknown as ContaReceber[];
    },
  });

  // Orçamentos aprovados que ainda não têm NENHUMA conta a receber lançada -
  // desde a migração 056, a conta só é criada aqui, ao lançar a NF (antes
  // era criada sozinha na aprovação, sem nenhuma nota ainda existir).
  const orcamentosQuery = useQuery({
    queryKey: ['faturamento-orcamentos-aprovados'],
    queryFn: async (): Promise<OrcamentoAprovado[]> => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select(
          'id, numero_orcamento, ordem_servico_id, ordens_servico(numero_os, cliente_id, cliente_nome, status_os), orcamento_itens(preco_unitario, quantidade)',
        )
        .eq('status', 'Aprovado');
      if (error) throw error;
      return data as unknown as OrcamentoAprovado[];
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

  const orcamentosComConta = new Set((contasQuery.data ?? []).map((c) => c.orcamento_id).filter((id): id is number => id != null));

  const linhas: LinhaFaturamento[] = [
    ...(contasQuery.data ?? []).map((c): LinhaFaturamento => ({
      chave: `cr-${c.id}`,
      contaId: c.id,
      orcamentoId: c.orcamento_id,
      numero: c.numero_conta,
      clienteId: c.cliente_id,
      descricao: c.descricao ?? '',
      valor: c.valor,
      // Sem orçamento vinculado (lançamento avulso) não há status de OS pra
      // checar - fica sempre "não liberado/não aplicável" nesse sentido.
      statusOS: null,
      nf_tipo: c.nf_tipo,
      nf_numero: c.nf_numero,
      nf_serie: c.nf_serie,
      nf_chave_acesso: c.nf_chave_acesso,
      nf_data_emissao: c.nf_data_emissao,
      boleto_numero: c.boleto_numero,
      boleto_linha_digitavel: c.boleto_linha_digitavel,
      boleto_vencimento: c.boleto_vencimento,
    })),
    ...(orcamentosQuery.data ?? [])
      .filter((o) => !orcamentosComConta.has(o.id))
      .map((o): LinhaFaturamento => {
        const valor = (o.orcamento_itens ?? []).reduce((s, it) => s + (it.preco_unitario ?? 0) * it.quantidade, 0);
        return {
          chave: `orc-${o.id}`,
          contaId: null,
          orcamentoId: o.id,
          numero: o.numero_orcamento,
          clienteId: o.ordens_servico?.cliente_id ?? null,
          descricao: `Orçamento ${o.numero_orcamento} - OS ${o.ordens_servico?.numero_os ?? ''}`,
          valor,
          statusOS: o.ordens_servico?.status_os ?? null,
          nf_tipo: null,
          nf_numero: null,
          nf_serie: null,
          nf_chave_acesso: null,
          nf_data_emissao: null,
          boleto_numero: null,
          boleto_linha_digitavel: null,
          boleto_vencimento: null,
        };
      }),
  ];

  const liberadas = linhas.filter((l) => !l.nf_numero && (l.contaId == null ? liberada(l.statusOS) : true));

  function nomeCliente(id: number | null) {
    return id ? clientesQuery.data?.find((c) => c.id === id)?.razao_social ?? `#${id}` : '-';
  }

  function abrirLancarNota(l: LinhaFaturamento) {
    setLinhaSelecionada(l);
    setForm({
      nf_tipo: l.nf_tipo ?? 'NFS-e',
      nf_numero: l.nf_numero ?? '',
      nf_serie: l.nf_serie ?? '',
      nf_chave_acesso: l.nf_chave_acesso ?? '',
      nf_data_emissao: l.nf_data_emissao ?? '',
      boleto_numero: l.boleto_numero ?? '',
      boleto_linha_digitavel: l.boleto_linha_digitavel ?? '',
      boleto_vencimento: l.boleto_vencimento ?? '',
    });
    setErro(null);
  }

  async function salvarNota() {
    if (!linhaSelecionada) return;
    setErro(null);
    if (!form.nf_numero) {
      setErro('Informe o número da nota.');
      return;
    }
    setSalvando(true);
    try {
      const camposNota = {
        nf_tipo: form.nf_tipo,
        nf_numero: form.nf_numero,
        nf_serie: form.nf_serie || null,
        nf_chave_acesso: form.nf_chave_acesso || null,
        nf_data_emissao: form.nf_data_emissao || null,
        boleto_numero: form.boleto_numero || null,
        boleto_linha_digitavel: form.boleto_linha_digitavel || null,
        boleto_vencimento: form.boleto_vencimento || null,
      };
      if (linhaSelecionada.contaId) {
        // Conta já existia (lançamento avulso ou criada antes da migração
        // 056) - só atualiza os dados de NF/boleto.
        const { error } = await supabase.from('contas_receber').update(camposNota).eq('id', linhaSelecionada.contaId);
        if (error) throw error;
      } else {
        // Ainda não existe conta pra esse orçamento - cria agora, com os
        // dados de NF/boleto já preenchidos de uma vez.
        const numeroConta = await gerarNumeroSequencial('CR', 'contas_receber', 'numero_conta');
        const vencimento = new Date();
        vencimento.setDate(vencimento.getDate() + 30);
        const { error } = await supabase.from('contas_receber').insert({
          numero_conta: numeroConta,
          orcamento_id: linhaSelecionada.orcamentoId,
          cliente_id: linhaSelecionada.clienteId,
          descricao: linhaSelecionada.descricao,
          valor: linhaSelecionada.valor,
          data_vencimento: vencimento.toISOString().slice(0, 10),
          status: 'Em aberto',
          ...camposNota,
        });
        if (error) throw error;
      }
      setLinhaSelecionada(null);
      qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
      qc.invalidateQueries({ queryKey: ['faturamento-orcamentos-aprovados'] });
      qc.invalidateQueries({ queryKey: ['contas-receber'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function removerNota(l: LinhaFaturamento) {
    if (!l.contaId) return;
    if (!confirm(`Remover os dados de nota fiscal/boleto de ${l.numero}?`)) return;
    const { error } = await supabase
      .from('contas_receber')
      .update({
        nf_tipo: null,
        nf_numero: null,
        nf_serie: null,
        nf_chave_acesso: null,
        nf_data_emissao: null,
        boleto_numero: null,
        boleto_linha_digitavel: null,
        boleto_vencimento: null,
      })
      .eq('id', l.contaId);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
  }

  // mailto: não anexa arquivo - igual a todo resto do sistema (WhatsApp/
  // e-mail em outras telas), quem envia precisa anexar o PDF da nota,
  // laudo e boleto manualmente no próprio cliente de e-mail.
  function enviarPorEmail(l: LinhaFaturamento) {
    const email = clientesQuery.data?.find((cl) => cl.id === l.clienteId)?.email;
    const corpo = `Olá! Segue a nota fiscal ${l.nf_tipo ?? ''} ${l.nf_numero ?? ''}${l.nf_serie ? '/' + l.nf_serie : ''} referente a "${l.descricao ?? l.numero}".${l.boleto_numero ? ` Boleto: ${l.boleto_numero}.` : ''} Anexamos o PDF da nota (e do laudo/boleto, quando aplicável) a este e-mail.`;
    window.open(linkEmail(email, `Q-CVF Medical - Nota fiscal ${l.nf_numero ?? ''}`, corpo), '_blank');
  }

  if (contasQuery.isLoading || orcamentosQuery.isLoading || clientesQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Faturamento (NF-e / NFS-e)</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Controle/registro apenas - a emissão da nota continua sendo feita fora do sistema (Mentora ou o site da
        prefeitura). A conta a receber é criada aqui mesmo, junto com os dados de NF e boleto, no momento do
        lançamento (antes disso o orçamento aprovado aparece como "Aguardando entrega"/"Liberado").
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
            <th>Nº</th>
            <th>Cliente</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Nota fiscal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave}>
              <td className="mono">{l.numero}</td>
              <td>{nomeCliente(l.clienteId)}</td>
              <td>{l.descricao}</td>
              <td>R$ {Number(l.valor).toFixed(2)}</td>
              <td>
                {l.nf_numero ? (
                  <>
                    <Badge tono="teal">Faturado</Badge>{' '}
                    <span className="mono" style={{ fontSize: 12 }}>
                      {l.nf_tipo} {l.nf_numero}
                      {l.nf_serie ? `/${l.nf_serie}` : ''}
                    </span>
                  </>
                ) : l.contaId == null && liberada(l.statusOS) ? (
                  <Badge tono="copper">Liberado</Badge>
                ) : l.contaId == null ? (
                  <Badge tono="neutro">Aguardando entrega</Badge>
                ) : (
                  <Badge tono="ambar">Não faturado</Badge>
                )}
              </td>
              <td className="acoes-tabela">
                <button
                  className="botao-secundario"
                  onClick={() => abrirLancarNota(l)}
                  disabled={l.contaId == null && !liberada(l.statusOS)}
                  title={l.contaId == null && !liberada(l.statusOS) ? 'Aguardando o equipamento ficar pronto/entregue' : undefined}
                >
                  {l.nf_numero ? 'Editar NF' : 'Lançar NF'}
                </button>
                {l.nf_numero && (
                  <button className="botao-secundario" onClick={() => enviarPorEmail(l)}>
                    Enviar por e-mail
                  </button>
                )}
                {l.nf_numero && l.contaId && (
                  <button className="botao-secundario perigo" onClick={() => removerNota(l)}>
                    Remover NF
                  </button>
                )}
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={6}>Nenhuma conta a receber ou orçamento aprovado encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {linhaSelecionada && (
        <ModalJanela
          titulo={`Lançar nota fiscal - ${linhaSelecionada.numero}`}
          aoFechar={() => setLinhaSelecionada(null)}
        >
            <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
              {nomeCliente(linhaSelecionada.clienteId)} - R$ {Number(linhaSelecionada.valor).toFixed(2)}
            </p>

            <h2 style={{ fontSize: 13, marginTop: 12 }}>Nota fiscal</h2>
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

            <h2 style={{ fontSize: 13, marginTop: 16 }}>Boleto</h2>
            <div className="campo-form">
              <label>Número do boleto</label>
              <input
                type="text"
                value={form.boleto_numero}
                onChange={(e) => setForm((f) => ({ ...f, boleto_numero: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Linha digitável</label>
              <input
                type="text"
                value={form.boleto_linha_digitavel}
                onChange={(e) => setForm((f) => ({ ...f, boleto_linha_digitavel: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Vencimento do boleto</label>
              <input
                type="date"
                value={form.boleto_vencimento}
                onChange={(e) => setForm((f) => ({ ...f, boleto_vencimento: e.target.value }))}
              />
            </div>

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setLinhaSelecionada(null)} disabled={salvando}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={salvarNota} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
        </ModalJanela>
      )}
    </div>
  );
}
