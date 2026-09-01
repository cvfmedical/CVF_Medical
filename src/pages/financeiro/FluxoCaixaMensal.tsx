import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconFileTypePdf, IconPlus, IconTrash } from '@tabler/icons-react';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { exportarTabelaPdf } from '../../lib/exportarPdf';

interface ContaCaixa {
  id: number;
  nome: string;
}

interface SaldoMensal {
  id: number;
  saldo_caixa_id: number;
  mes_ano: string;
  saldo_inicial: number;
  criado_em: string;
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
// Contas a pagar/Contas a receber (não duplica dado, só visualiza).
//
// Os saldos de caixa (Banco Inter, Banco Itaú etc.) são informados UMA
// VEZ por mês (o saldo do início do mês) e ficam travados depois disso -
// não são "o saldo de hoje", editável a qualquer momento. A partir daí o
// sistema SIMULA dia a dia: cada dia negativo (paga mais do que recebe)
// vai descontando das contas na ordem cadastrada, permanentemente, até o
// fim do mês - por isso "de onde sai o dinheiro" reflete o que já foi
// consumido nos dias anteriores, não um cálculo isolado por dia. "Peças
// Cortical" é a única exceção automática (não é dinheiro em caixa, é um
// valor a receber) e fica de fora dessa simulação bancária.
export function FluxoCaixaMensal() {
  const qc = useQueryClient();
  const [mesAno, setMesAno] = useState(mesAtualISO());
  const [novaContaNome, setNovaContaNome] = useState('');
  const [novosSaldosIniciais, setNovosSaldosIniciais] = useState<Record<number, string>>({});
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const [ano, mes] = mesAno.split('-').map(Number);
  const inicio = `${mesAno}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const diasNoMes = new Date(ano, mes, 0).getDate();

  const contasCaixaQuery = useQuery({
    queryKey: ['contas-caixa'],
    queryFn: async (): Promise<ContaCaixa[]> => {
      const { data, error } = await supabase.from('saldos_caixa').select('id, nome').order('id');
      if (error) throw error;
      return data as ContaCaixa[];
    },
  });

  const saldosMensaisQuery = useQuery({
    queryKey: ['saldos-caixa-mensal', mesAno],
    queryFn: async (): Promise<SaldoMensal[]> => {
      const { data, error } = await supabase.from('saldos_caixa_mensal').select('*').eq('mes_ano', mesAno);
      if (error) throw error;
      return data as SaldoMensal[];
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

  async function confirmarSaldoInicial(conta: ContaCaixa) {
    const valor = Number(novosSaldosIniciais[conta.id] ?? '0') || 0;
    if (
      !confirm(
        `Confirma o saldo inicial de ${formatarMoeda(valor)} para "${conta.nome}" em ${NOMES_MES[mes - 1]}/${ano}? Depois de confirmado, não pode mais ser alterado - só um novo lançamento de Contas a pagar/receber muda o saldo daqui pra frente.`,
      )
    )
      return;
    const { error } = await supabase
      .from('saldos_caixa_mensal')
      .insert({ saldo_caixa_id: conta.id, mes_ano: mesAno, saldo_inicial: valor });
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['saldos-caixa-mensal', mesAno] });
  }

  async function adicionarConta() {
    const nome = novaContaNome.trim();
    if (!nome) return;
    const { error } = await supabase.from('saldos_caixa').insert({ nome });
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    setNovaContaNome('');
    qc.invalidateQueries({ queryKey: ['contas-caixa'] });
  }

  async function excluirConta(conta: ContaCaixa) {
    if (!confirm(`Remover a conta "${conta.nome}"? Isso apaga também o histórico de saldos iniciais dela em todos os meses.`)) return;
    const { error } = await supabase.from('saldos_caixa').delete().eq('id', conta.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['contas-caixa'] });
    qc.invalidateQueries({ queryKey: ['saldos-caixa-mensal', mesAno] });
  }

  if (
    contasCaixaQuery.isLoading ||
    saldosMensaisQuery.isLoading ||
    pagarQuery.isLoading ||
    receberQuery.isLoading ||
    pecasCorticalQuery.isLoading
  )
    return <CarregandoTela />;

  const pecasCorticalPendente = pecasCorticalQuery.data ?? 0;
  const contas = contasCaixaQuery.data ?? [];
  const saldoInicialPorConta = new Map((saldosMensaisQuery.data ?? []).map((s) => [s.saldo_caixa_id, Number(s.saldo_inicial)]));
  const contasDefinidas = contas.filter((c) => saldoInicialPorConta.has(c.id));
  const contasPendentes = contas.filter((c) => !saldoInicialPorConta.has(c.id));

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

  // Simulação real: cada dia negativo desconta das contas na ordem
  // cadastrada, permanentemente (o que sai de uma conta num dia reflete
  // no saldo dela nos dias seguintes) - não é um cálculo isolado por dia.
  const saldoCorrentePorConta = new Map(contasDefinidas.map((c) => [c.id, saldoInicialPorConta.get(c.id) ?? 0]));
  const linhas = dias.map((d) => {
    const net = d.receberTotal - d.pagarTotal;
    const retiradas: { nome: string; valor: number }[] = [];
    if (net >= 0) {
      if (contasDefinidas.length > 0) {
        const primeira = contasDefinidas[0];
        saldoCorrentePorConta.set(primeira.id, (saldoCorrentePorConta.get(primeira.id) ?? 0) + net);
      }
    } else {
      let faltante = -net;
      for (const c of contasDefinidas) {
        if (faltante <= 0.001) break;
        const disponivel = saldoCorrentePorConta.get(c.id) ?? 0;
        if (disponivel <= 0) continue;
        const retirado = Math.min(disponivel, faltante);
        saldoCorrentePorConta.set(c.id, disponivel - retirado);
        retiradas.push({ nome: c.nome, valor: retirado });
        faltante -= retirado;
      }
      if (faltante > 0.001) {
        const ultima = contasDefinidas[contasDefinidas.length - 1];
        if (ultima) {
          saldoCorrentePorConta.set(ultima.id, (saldoCorrentePorConta.get(ultima.id) ?? 0) - faltante);
          retiradas.push({ nome: `${ultima.nome} (fica negativa)`, valor: faltante });
        } else {
          retiradas.push({ nome: 'Nenhuma conta com saldo inicial definido neste mês', valor: faltante });
        }
      }
    }
    const saldoBancosDia = Array.from(saldoCorrentePorConta.values()).reduce((s, v) => s + v, 0);
    return { ...d, retiradas, saldoBancosDia, negativo: saldoBancosDia < 0, saldoAcumulado: saldoBancosDia + pecasCorticalPendente };
  });

  const saldoInicialBancos = contasDefinidas.reduce((s, c) => s + (saldoInicialPorConta.get(c.id) ?? 0), 0);
  const saldoInicial = saldoInicialBancos + pecasCorticalPendente;
  const totalPagarMes = linhas.reduce((s, l) => s + l.pagarTotal, 0);
  const totalReceberMes = linhas.reduce((s, l) => s + l.receberTotal, 0);
  const saldoFinalPorConta = contasDefinidas.map((c) => ({ nome: c.nome, saldo: saldoCorrentePorConta.get(c.id) ?? 0 }));
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
          { label: 'Situação' },
        ],
        linhas: linhas.map((l) => [
          new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' }),
          l.pagarTotal ? formatarMoeda(l.pagarTotal) : '',
          l.receberTotal ? formatarMoeda(l.receberTotal) : '',
          formatarMoeda(l.receberTotal - l.pagarTotal),
          formatarMoeda(l.saldoAcumulado),
          l.negativo
            ? `Negativo - saiu de ${l.retiradas.map((r) => `${formatarMoeda(r.valor)} (${r.nome})`).join(' + ')}`
            : 'Positivo',
        ]),
        totalLabel: 'TOTAL DO MÊS',
        totalValor: `A pagar ${formatarMoeda(totalPagarMes)} · A receber ${formatarMoeda(totalReceberMes)} · Saldo final ${formatarMoeda(
          linhas[linhas.length - 1]?.saldoAcumulado ?? saldoInicial,
        )}`,
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
        cruza os dois. O saldo de cada conta abaixo é informado uma vez no início do mês e fica travado; dali em
        diante o sistema simula o consumo dia a dia.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, minWidth: 180, background: 'var(--surface-secondary, #f8fafc)' }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-400)', marginBottom: 4 }}>Peças Cortical</label>
          <div style={{ fontWeight: 600 }}>{formatarMoeda(pecasCorticalPendente)}</div>
          <span style={{ fontSize: 10, color: 'var(--ink-400)' }}>Automático - peças com faturamento diferido ainda em aberto</span>
        </div>

        {contasDefinidas.map((c) => {
          const registro = (saldosMensaisQuery.data ?? []).find((s) => s.saldo_caixa_id === c.id)!;
          return (
            <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, minWidth: 180, position: 'relative' }}>
              <button
                className="botao-icone perigo"
                title="Remover conta (apaga o histórico dela)"
                onClick={() => excluirConta(c)}
                style={{ position: 'absolute', top: 4, right: 4, padding: 2 }}
              >
                <IconTrash size={13} />
              </button>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-400)', marginBottom: 4 }}>{c.nome}</label>
              <div style={{ fontWeight: 600 }}>{formatarMoeda(Number(registro.saldo_inicial))}</div>
              <span style={{ fontSize: 10, color: 'var(--ink-400)' }}>
                Saldo inicial de {NOMES_MES[mes - 1]} · travado em {new Date(registro.criado_em).toLocaleDateString('pt-BR')}
              </span>
            </div>
          );
        })}

        {contasPendentes.map((c) => (
          <div key={c.id} style={{ border: '1px solid var(--copper-500, #b45309)', borderRadius: 8, padding: 10, minWidth: 200, position: 'relative' }}>
            <button
              className="botao-icone perigo"
              title="Remover conta"
              onClick={() => excluirConta(c)}
              style={{ position: 'absolute', top: 4, right: 4, padding: 2 }}
            >
              <IconTrash size={13} />
            </button>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-400)', marginBottom: 4 }}>{c.nome}</label>
            <input
              type="number"
              step="0.01"
              placeholder="Saldo inicial do mês"
              value={novosSaldosIniciais[c.id] ?? ''}
              onChange={(e) => setNovosSaldosIniciais((s) => ({ ...s, [c.id]: e.target.value }))}
              style={{ width: '100%', marginBottom: 6 }}
            />
            <button className="botao-secundario botao-pequeno" onClick={() => confirmarSaldoInicial(c)}>
              Confirmar saldo de {NOMES_MES[mes - 1]}
            </button>
          </div>
        ))}

        <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 10, minWidth: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
          <input
            type="text"
            placeholder="Nova conta (ex: Caixa)"
            value={novaContaNome}
            onChange={(e) => setNovaContaNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionarConta()}
          />
          <button className="botao-secundario botao-pequeno" onClick={adicionarConta}>
            <IconPlus size={14} /> Adicionar conta
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
        <span>
          Saldo inicial (Peças Cortical + contas travadas): <strong>{formatarMoeda(saldoInicial)}</strong>
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
            <th>Situação</th>
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
                <td>
                  <Badge tono={l.negativo ? 'danger' : 'teal'}>{l.negativo ? 'Negativo' : 'Positivo'}</Badge>
                  {l.negativo && (
                    <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>
                      Saiu de: {l.retiradas.map((r) => `${formatarMoeda(r.valor)} (${r.nome})`).join(' + ')}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 600 }}>
            <td>TOTAL DO MÊS</td>
            <td>{formatarMoeda(totalPagarMes)}</td>
            <td>{formatarMoeda(totalReceberMes)}</td>
            <td>{formatarMoeda(totalReceberMes - totalPagarMes)}</td>
            <td>{formatarMoeda(linhas[linhas.length - 1]?.saldoAcumulado ?? saldoInicial)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      {saldoFinalPorConta.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: 12 }}>
          Saldo simulado de cada conta ao final de {NOMES_MES[mes - 1]}:{' '}
          {saldoFinalPorConta.map((c) => `${c.nome}: ${formatarMoeda(c.saldo)}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
