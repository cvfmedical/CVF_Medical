import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconFileTypePdf, IconPlus, IconTrash } from '@tabler/icons-react';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { CarregandoTela } from '../../components/CarregandoTela';
import { exportarTabelaPdf } from '../../lib/exportarPdf';

interface SaldoCaixa {
  id: number;
  nome: string;
  valor: number;
  atualizado_em: string;
}

interface LinhaConta {
  valor: number;
  data_vencimento: string;
  descricao: string | null;
  status: string;
}

interface ContaPagarLinha extends LinhaConta {
  fornecedor_id: number | null;
}

interface ContaReceberLinha extends LinhaConta {
  cliente_id: number | null;
}

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatarMoeda(v: number): string {
  return `R$ ${v.toFixed(2)}`;
}

// Painel do fluxo de caixa mensal - substitui o controle que era feito à
// mão numa planilha à parte, cruzando dia a dia o que já está lançado em
// Contas a pagar/Contas a receber (não duplica dado, só visualiza). Os
// "saldos de caixa" (ex.: saldo em banco, peças a receber do Grupo
// Cortical) são o único dado digitado manualmente aqui - o resto é
// puxado ao vivo das duas telas de lançamento.
export function FluxoCaixaMensal() {
  const qc = useQueryClient();
  const [mesAno, setMesAno] = useState(mesAtualISO());
  const [novoSaldoNome, setNovoSaldoNome] = useState('');
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const [ano, mes] = mesAno.split('-').map(Number);
  const inicio = `${mesAno}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const diasNoMes = new Date(ano, mes, 0).getDate();

  const saldosQuery = useQuery({
    queryKey: ['saldos-caixa'],
    queryFn: async (): Promise<SaldoCaixa[]> => {
      const { data, error } = await supabase.from('saldos_caixa').select('*').order('id');
      if (error) throw error;
      return data as SaldoCaixa[];
    },
  });

  // "Peças Cortical" não é digitado - é a soma das contas a receber de
  // peças com faturamento diferido (clientes.faturamento_pecas_diferido)
  // ainda em aberto, geradas automaticamente ao lançar a NF de serviço em
  // Faturamento.tsx (descrição termina em "(peças)", sem NF própria).
  const pecasCorticalQuery = useQuery({
    queryKey: ['pecas-cortical-pendente'],
    queryFn: async (): Promise<number> => {
      const { data: clientesDiferido, error: erroClientes } = await supabase
        .from('clientes')
        .select('id')
        .eq('faturamento_pecas_diferido', true);
      if (erroClientes) throw erroClientes;
      const ids = (clientesDiferido ?? []).map((c) => c.id);
      if (ids.length === 0) return 0;
      const { data, error } = await supabase
        .from('contas_receber')
        .select('valor')
        .in('cliente_id', ids)
        .eq('status', 'Em aberto')
        .ilike('descricao', '%(peças)%');
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.valor), 0);
    },
  });

  const pagarQuery = useQuery({
    queryKey: ['fluxo-caixa-pagar', mesAno],
    queryFn: async (): Promise<ContaPagarLinha[]> => {
      const { data, error } = await supabase
        .from('contas_pagar')
        .select('valor, data_vencimento, descricao, status, fornecedor_id')
        .gte('data_vencimento', inicio)
        .lte('data_vencimento', fim)
        .neq('status', 'Cancelado');
      if (error) throw error;
      return data as ContaPagarLinha[];
    },
  });

  const receberQuery = useQuery({
    queryKey: ['fluxo-caixa-receber', mesAno],
    queryFn: async (): Promise<ContaReceberLinha[]> => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select('valor, data_vencimento, descricao, status, cliente_id')
        .gte('data_vencimento', inicio)
        .lte('data_vencimento', fim)
        .neq('status', 'Cancelado');
      if (error) throw error;
      return data as ContaReceberLinha[];
    },
  });

  const fornecedoresQuery = useQuery({
    queryKey: ['fornecedores-opcoes-fluxo-caixa'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('id, razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-fluxo-caixa'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  function nomeFornecedor(id: number | null): string | null {
    return id ? fornecedoresQuery.data?.find((f) => f.id === id)?.razao_social ?? null : null;
  }
  function nomeCliente(id: number | null): string | null {
    return id ? clientesQuery.data?.find((c) => c.id === id)?.razao_social ?? null : null;
  }

  async function salvarSaldo(s: SaldoCaixa, novoValor: number) {
    const { error } = await supabase
      .from('saldos_caixa')
      .update({ valor: novoValor, atualizado_em: new Date().toISOString().slice(0, 10) })
      .eq('id', s.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['saldos-caixa'] });
  }

  async function adicionarSaldo() {
    const nome = novoSaldoNome.trim();
    if (!nome) return;
    const { error } = await supabase.from('saldos_caixa').insert({ nome, valor: 0 });
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    setNovoSaldoNome('');
    qc.invalidateQueries({ queryKey: ['saldos-caixa'] });
  }

  async function excluirSaldo(s: SaldoCaixa) {
    if (!confirm(`Remover "${s.nome}" dos saldos de caixa?`)) return;
    const { error } = await supabase.from('saldos_caixa').delete().eq('id', s.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['saldos-caixa'] });
  }

  if (saldosQuery.isLoading || pagarQuery.isLoading || receberQuery.isLoading || pecasCorticalQuery.isLoading) return <CarregandoTela />;

  const pecasCorticalPendente = pecasCorticalQuery.data ?? 0;
  const saldoInicial = (saldosQuery.data ?? []).reduce((s, r) => s + Number(r.valor), 0) + pecasCorticalPendente;

  const dias = Array.from({ length: diasNoMes }, (_, i) => {
    const dataStr = `${mesAno}-${String(i + 1).padStart(2, '0')}`;
    const pagarDoDia = (pagarQuery.data ?? []).filter((c) => c.data_vencimento === dataStr);
    const receberDoDia = (receberQuery.data ?? []).filter((c) => c.data_vencimento === dataStr);
    return {
      data: dataStr,
      pagarTotal: pagarDoDia.reduce((s, c) => s + Number(c.valor), 0),
      pagarItens: pagarDoDia.map((c) => ({ nome: nomeFornecedor(c.fornecedor_id) ?? c.descricao ?? 'Sem descrição', valor: Number(c.valor) })),
      receberTotal: receberDoDia.reduce((s, c) => s + Number(c.valor), 0),
      receberItens: receberDoDia.map((c) => ({ nome: nomeCliente(c.cliente_id) ?? c.descricao ?? 'Sem descrição', valor: Number(c.valor) })),
    };
  });

  let acumulado = saldoInicial;
  const linhas = dias.map((d) => {
    acumulado += d.receberTotal - d.pagarTotal;
    return { ...d, saldoAcumulado: acumulado };
  });

  const totalPagarMes = linhas.reduce((s, l) => s + l.pagarTotal, 0);
  const totalReceberMes = linhas.reduce((s, l) => s + l.receberTotal, 0);
  const hojeISO = new Date().toISOString().slice(0, 10);

  async function exportarPdf() {
    setExportandoPdf(true);
    try {
      await exportarTabelaPdf({
        titulo: 'Fluxo de caixa mensal',
        subtitulo: `${NOMES_MES[mes - 1]}/${ano} - Saldo inicial: ${formatarMoeda(saldoInicial)} - Total a pagar: ${formatarMoeda(totalPagarMes)} - Total a receber: ${formatarMoeda(totalReceberMes)}`,
        colunas: [
          { label: 'Data' },
          { label: 'A pagar', alinhamento: 'right' },
          { label: 'A receber', alinhamento: 'right' },
          { label: 'Saldo do dia', alinhamento: 'right' },
          { label: 'Saldo acumulado', alinhamento: 'right' },
        ],
        linhas: linhas.map((l) => [
          new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' }),
          l.pagarTotal ? formatarMoeda(l.pagarTotal) : '',
          l.receberTotal ? formatarMoeda(l.receberTotal) : '',
          formatarMoeda(l.receberTotal - l.pagarTotal),
          formatarMoeda(l.saldoAcumulado),
        ]),
        totalLabel: 'TOTAL DO MÊS',
        totalValor: `A pagar ${formatarMoeda(totalPagarMes)} · A receber ${formatarMoeda(totalReceberMes)}`,
        nomeArquivo: `fluxo-caixa-${mesAno}`,
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
        <h1>Fluxo de caixa mensal</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={mesAno} onChange={(e) => setMesAno(e.target.value)} />
          <button className="botao-secundario botao-pequeno" onClick={exportarPdf} disabled={exportandoPdf}>
            <IconFileTypePdf size={16} /> {exportandoPdf ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Visualização dia a dia do que já está lançado em Contas a pagar e Contas a receber - não lança nada novo, só
        cruza os dois. O saldo acumulado parte da soma de "Peças Cortical" (calculado automaticamente) com os saldos
        de caixa abaixo (esses sim, digitados).
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, minWidth: 180, background: 'var(--surface-secondary, #f8fafc)' }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-400)', marginBottom: 4 }}>Peças Cortical</label>
          <div style={{ fontWeight: 600 }}>{formatarMoeda(pecasCorticalPendente)}</div>
          <span style={{ fontSize: 10, color: 'var(--ink-400)' }}>Automático - peças com faturamento diferido ainda em aberto</span>
        </div>
        {(saldosQuery.data ?? []).map((s) => (
          <div
            key={s.id}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, minWidth: 180, position: 'relative' }}
          >
            <button
              className="botao-icone perigo"
              title="Remover"
              onClick={() => excluirSaldo(s)}
              style={{ position: 'absolute', top: 4, right: 4, padding: 2 }}
            >
              <IconTrash size={13} />
            </button>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-400)', marginBottom: 4 }}>{s.nome}</label>
            <input
              type="number"
              step="0.01"
              defaultValue={s.valor}
              onBlur={(e) => {
                const novo = Number(e.target.value);
                if (!Number.isNaN(novo) && novo !== Number(s.valor)) salvarSaldo(s, novo);
              }}
              style={{ width: '100%', fontWeight: 600 }}
            />
            <span style={{ fontSize: 10, color: 'var(--ink-400)' }}>
              Atualizado em {new Date(s.atualizado_em + 'T00:00:00').toLocaleDateString('pt-BR')}
            </span>
          </div>
        ))}
        <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 10, minWidth: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
          <input
            type="text"
            placeholder="Novo saldo (ex: Caixa)"
            value={novoSaldoNome}
            onChange={(e) => setNovoSaldoNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionarSaldo()}
          />
          <button className="botao-secundario botao-pequeno" onClick={adicionarSaldo}>
            <IconPlus size={14} /> Adicionar
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 12, fontSize: 13 }}>
        <span>
          Saldo inicial (Peças Cortical + saldos acima): <strong>{formatarMoeda(saldoInicial)}</strong>
        </span>
        <span>
          Total a pagar no mês: <strong>{formatarMoeda(totalPagarMes)}</strong>
        </span>
        <span>
          Total a receber no mês: <strong>{formatarMoeda(totalReceberMes)}</strong>
        </span>
      </div>

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Data</th>
            <th>A pagar</th>
            <th>A receber</th>
            <th>Saldo do dia</th>
            <th>Saldo acumulado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const saldoDia = l.receberTotal - l.pagarTotal;
            return (
              <tr key={l.data} style={l.data === hojeISO ? { background: 'var(--copper-100, #fdf1e6)' } : undefined}>
                <td className="mono">
                  {new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' })}
                </td>
                <td>
                  {l.pagarTotal > 0 && (
                    <>
                      {formatarMoeda(l.pagarTotal)}
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{l.pagarItens.map((it) => it.nome).join(', ')}</div>
                    </>
                  )}
                </td>
                <td>
                  {l.receberTotal > 0 && (
                    <>
                      {formatarMoeda(l.receberTotal)}
                      <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>{l.receberItens.map((it) => it.nome).join(', ')}</div>
                    </>
                  )}
                </td>
                <td style={{ color: saldoDia < 0 ? 'var(--danger-500, #dc2626)' : saldoDia > 0 ? 'var(--teal-600, #0d9488)' : undefined }}>
                  {(l.pagarTotal > 0 || l.receberTotal > 0) && formatarMoeda(saldoDia)}
                </td>
                <td style={{ fontWeight: 600 }}>{formatarMoeda(l.saldoAcumulado)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
