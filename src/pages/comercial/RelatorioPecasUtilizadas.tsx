import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { CarregandoTela } from '../../components/CarregandoTela';
import { mensagemErro } from '../../lib/erros';
import { exportarRelatorioPecasXlsx, type LinhaRelatorioPecas } from '../../lib/exportarXlsx';

interface ClienteOpcao {
  id: number;
  razao_social: string;
  nome_fantasia: string | null;
}

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Relatório mensal de peças utilizadas por cliente - substitui o
// controle que era feito à mão numa planilha à parte (ex.: envio
// mensal pro Grupo Cortical). Puxa das notas fiscais já lançadas em
// Faturamento (contas_receber), pelos orçamentos e itens ligados a
// elas. O preço do item é o "Preço de venda" do catálogo (Cadastro de
// itens), não o valor efetivamente cobrado no orçamento - o objetivo
// aqui é controle de peças usadas, não faturamento.
export function RelatorioPecasUtilizadas() {
  const [clientesSelecionados, setClientesSelecionados] = useState<Set<number>>(new Set());
  const [mesAno, setMesAno] = useState(mesAtualISO());
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaRelatorioPecas[] | null>(null);

  const clientesQuery = useQuery({
    queryKey: ['clientes-relatorio-pecas'],
    queryFn: async (): Promise<ClienteOpcao[]> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, razao_social, nome_fantasia')
        .order('razao_social');
      if (error) throw error;
      return data as ClienteOpcao[];
    },
  });

  function alternarCliente(id: number) {
    setClientesSelecionados((s) => {
      const nova = new Set(s);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  function tituloMes(): string {
    const [ano, mes] = mesAno.split('-').map(Number);
    return `${NOMES_MES[mes - 1]}/${ano}`;
  }

  async function gerarRelatorio() {
    if (clientesSelecionados.size === 0) {
      setErro('Selecione pelo menos um cliente.');
      return;
    }
    setErro(null);
    setGerando(true);
    setLinhas(null);
    try {
      const clienteIds = Array.from(clientesSelecionados);
      const [ano, mes] = mesAno.split('-').map(Number);
      const inicio = `${mesAno}-01`;
      const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);

      const { data: contas, error: errContas } = await supabase
        .from('contas_receber')
        .select('orcamento_id, cliente_id, nf_numero, nf_data_emissao')
        .in('cliente_id', clienteIds)
        .not('nf_numero', 'is', null)
        .gte('nf_data_emissao', inicio)
        .lte('nf_data_emissao', fim);
      if (errContas) throw errContas;

      // Parcelado gera uma linha de contas_receber por parcela, todas com
      // o mesmo orcamento_id/NF - por isso o Map (chave = orcamento_id)
      // em vez de usar as linhas cruas direto.
      const nfPorOrcamento = new Map<number, { nf: string; clienteId: number }>();
      (contas ?? []).forEach((c) => {
        if (c.orcamento_id != null) nfPorOrcamento.set(c.orcamento_id, { nf: String(c.nf_numero), clienteId: c.cliente_id });
      });
      const orcamentoIds = Array.from(nfPorOrcamento.keys());

      if (orcamentoIds.length === 0) {
        setLinhas([]);
        return;
      }

      const { data: orcamentos, error: errOrc } = await supabase
        .from('orcamentos')
        .select('id, numero_orcamento, valor_fixo_contrato, ordem_servico_id, ordens_servico(id, cliente_nome)')
        .in('id', orcamentoIds);
      if (errOrc) throw errOrc;

      const { data: itens, error: errItens } = await supabase
        .from('orcamento_itens')
        .select('id, orcamento_id, quantidade, descricao_servico, produtos_servicos(nome, preco_unitario)')
        .in('orcamento_id', orcamentoIds);
      if (errItens) throw errItens;

      const osIds = (orcamentos ?? [])
        .map((o) => (o as unknown as { ordem_servico_id: number }).ordem_servico_id)
        .filter((id): id is number => id != null);
      const { data: entradas, error: errEntradas } = await supabase
        .from('entradas_equipamento')
        .select('ordem_servico_id, numero_controle_cliente')
        .in('ordem_servico_id', osIds);
      if (errEntradas) throw errEntradas;

      const controlePorOS = new Map<number, string>();
      (entradas ?? []).forEach((e) => {
        if (e.numero_controle_cliente) controlePorOS.set(e.ordem_servico_id, e.numero_controle_cliente);
      });

      const nomeFantasiaPorCliente = new Map<number, string>();
      (clientesQuery.data ?? []).forEach((c) => nomeFantasiaPorCliente.set(c.id, c.nome_fantasia || c.razao_social));

      const itensPorOrcamento = new Map<number, typeof itens>();
      (itens ?? []).forEach((it) => {
        const lista = itensPorOrcamento.get(it.orcamento_id) ?? [];
        lista.push(it);
        itensPorOrcamento.set(it.orcamento_id, lista as never);
      });

      type OrcamentoComOS = {
        id: number;
        numero_orcamento: string;
        valor_fixo_contrato: number | null;
        ordem_servico_id: number;
        ordens_servico: { id: number; cliente_nome: string } | null;
      };

      const orcamentosOrdenados = [...((orcamentos ?? []) as unknown as OrcamentoComOS[])].sort((a, b) => {
        const empresaA = nomeFantasiaPorCliente.get(nfPorOrcamento.get(a.id)?.clienteId ?? -1) ?? '';
        const empresaB = nomeFantasiaPorCliente.get(nfPorOrcamento.get(b.id)?.clienteId ?? -1) ?? '';
        return empresaA.localeCompare(empresaB, 'pt-BR') || a.numero_orcamento.localeCompare(b.numero_orcamento, 'pt-BR');
      });

      const linhasGeradas: LinhaRelatorioPecas[] = [];
      for (const orc of orcamentosOrdenados) {
        const info = nfPorOrcamento.get(orc.id);
        const empresa = nomeFantasiaPorCliente.get(info?.clienteId ?? -1) ?? orc.ordens_servico?.cliente_nome ?? '-';
        const osKit = controlePorOS.get(orc.ordem_servico_id) ?? '-';
        const itensDoOrcamento = (itensPorOrcamento.get(orc.id) ?? []) as unknown as {
          quantidade: number | null;
          descricao_servico: string | null;
          produtos_servicos: { nome: string; preco_unitario: number | null } | null;
        }[];

        if (itensDoOrcamento.length === 0) {
          linhasGeradas.push({
            empresa,
            nf: info?.nf ?? '-',
            osKit,
            numeroOrcamento: orc.numero_orcamento,
            valorFixo: orc.valor_fixo_contrato,
            descricao: '-',
            quantidade: null,
            valorUnitario: null,
            total: null,
          });
          continue;
        }

        itensDoOrcamento.forEach((it, i) => {
          const descricao = it.produtos_servicos?.nome ?? it.descricao_servico ?? '-';
          const valorUnitario = it.produtos_servicos?.preco_unitario ?? null;
          const total = it.quantidade != null && valorUnitario != null ? it.quantidade * valorUnitario : null;
          linhasGeradas.push({
            empresa,
            nf: i === 0 ? (info?.nf ?? '-') : '',
            osKit: i === 0 ? osKit : '',
            numeroOrcamento: i === 0 ? orc.numero_orcamento : '',
            valorFixo: i === 0 ? orc.valor_fixo_contrato : null,
            descricao,
            quantidade: it.quantidade,
            valorUnitario,
            total,
          });
        });
      }

      setLinhas(linhasGeradas);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setGerando(false);
    }
  }

  async function exportar() {
    if (!linhas || linhas.length === 0) return;
    await exportarRelatorioPecasXlsx(tituloMes(), linhas);
  }

  if (clientesQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Relatório de peças utilizadas</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Gera, a partir das notas fiscais já lançadas em Faturamento, um relatório mensal de peças utilizadas por
        cliente - útil pra envios recorrentes (ex.: Grupo Cortical). O valor do item é o preço de venda cadastrado
        em Cadastro de itens, não o valor cobrado no orçamento.
      </p>

      {erro && <p className="erro-login">{erro}</p>}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            width: 320,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          <strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Clientes</strong>
          {(clientesQuery.data ?? []).map((c) => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={clientesSelecionados.has(c.id)} onChange={() => alternarCliente(c.id)} />
              {c.nome_fantasia || c.razao_social}
            </label>
          ))}
        </div>

        <div className="campo-form" style={{ margin: 0 }}>
          <label>Mês</label>
          <input type="month" value={mesAno} onChange={(e) => setMesAno(e.target.value)} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="botao-primario" onClick={gerarRelatorio} disabled={gerando}>
            {gerando ? 'Gerando...' : 'Gerar relatório'}
          </button>
        </div>
      </div>

      {linhas && (
        <div>
          <div className="crud-cabecalho">
            <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
              {linhas.length === 0
                ? 'Nenhuma nota fiscal encontrada pra esse período/clientes.'
                : `${linhas.length} linha(s) - ${tituloMes()}`}
            </p>
            <button className="botao-primario" onClick={exportar} disabled={linhas.length === 0}>
              Exportar .xlsx
            </button>
          </div>

          {linhas.length > 0 && (
            <table className="tabela-crud">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>NF</th>
                  <th>OS/KIT</th>
                  <th>Nº orç.</th>
                  <th>Valor</th>
                  <th>Descrição</th>
                  <th>Qtd</th>
                  <th>Valor</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i}>
                    <td>{l.empresa}</td>
                    <td className="mono">{l.nf}</td>
                    <td className="mono">{l.osKit}</td>
                    <td className="mono">{l.numeroOrcamento}</td>
                    <td>{l.valorFixo != null ? `R$ ${l.valorFixo.toFixed(2)}` : ''}</td>
                    <td>{l.descricao}</td>
                    <td>{l.quantidade ?? ''}</td>
                    <td>{l.valorUnitario != null ? `R$ ${l.valorUnitario.toFixed(2)}` : ''}</td>
                    <td>{l.total != null ? `R$ ${l.total.toFixed(2)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
