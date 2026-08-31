import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { useRascunhoDeTela } from '../../lib/useRascunhoDeTela';
import { IconCalendar, IconFileTypePdf, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { ComboboxBusca } from '../../components/ComboboxBusca';
import { useEntradaOrcamentoPorOS } from '../../lib/useEntradaOrcamentoPorOS';
import { exportarTabelaPdf } from '../../lib/exportarPdf';

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
  nf_tipo: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave_acesso: string | null;
  nf_data_emissao: string | null;
  orcamentos: {
    numero_orcamento: string;
    ordem_servico_id: number;
    ordens_servico: { numero_os: string } | null;
  } | null;
}

const STATUS_OPCOES = ['Em aberto', 'Recebido', 'Cancelado'];

async function gerarNumeroConta(): Promise<string> {
  return gerarNumeroSequencial('CR', 'contas_receber', 'numero_conta');
}

const formVazio = {
  cliente_id: '',
  descricao: '',
  parcelado: false,
  valor: '',
  data_vencimento: '',
  observacoes: '',
  valorTotal: '',
  numParcelas: '2',
  primeiroVencimento: '',
  intervaloDias: '30',
};

const COLUNAS_FILTRAVEIS = [
  'codigo_entrada',
  'numero_os',
  'numero_orcamento',
  'numero_conta',
  'cliente',
  'descricao',
  'valor',
  'data_vencimento',
  'status',
  'nota_fiscal',
];

export function ContasReceber() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { codigoEntradaPorOS } = useEntradaOrcamentoPorOS();
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [contaEditandoNF, setContaEditandoNF] = useState<ContaReceber | null>(null);
  const [formNF, setFormNF] = useState({ nf_tipo: 'NFS-e', nf_numero: '', nf_serie: '', nf_chave_acesso: '', nf_data_emissao: '' });
  const [erroNF, setErroNF] = useState<string | null>(null);
  const [salvandoNF, setSalvandoNF] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  // Alterar a data de recebimento de um título já baixado, sem precisar
  // mexer em status/valor - mesmo padrão de "Alterar data de pagamento"
  // já usado em Contas a Pagar.
  const [contaEditandoData, setContaEditandoData] = useState<ContaReceber | null>(null);
  const [novaDataRecebimento, setNovaDataRecebimento] = useState('');
  const [erroData, setErroData] = useState<string | null>(null);
  const [salvandoData, setSalvandoData] = useState(false);
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();

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
      const { data, error } = await supabase
        .from('contas_receber')
        .select('*, orcamentos(numero_orcamento, ordem_servico_id, ordens_servico(numero_os))')
        .order('data_vencimento');
      if (error) throw error;
      return data as unknown as ContaReceber[];
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

    if (form.parcelado) {
      const total = Number(form.valorTotal);
      if (!total || total <= 0) return setErro('Informe um valor total válido.');
      const n = Number(form.numParcelas);
      if (!n || n < 1) return setErro('Informe um número de parcelas válido.');
      if (!form.primeiroVencimento) return setErro('Informe o vencimento da 1ª parcela.');

      setSalvando(true);
      try {
        const intervalo = Number(form.intervaloDias) || 30;
        const totalCentavos = Math.round(total * 100);
        const baseCentavos = Math.floor(totalCentavos / n);
        const restoCentavos = totalCentavos - baseCentavos * n;

        for (let i = 0; i < n; i++) {
          const valorCentavos = baseCentavos + (i === n - 1 ? restoCentavos : 0);
          const vencimento = new Date(`${form.primeiroVencimento}T00:00:00`);
          vencimento.setDate(vencimento.getDate() + intervalo * i);
          const numero = await gerarNumeroConta();
          const { error } = await supabase.from('contas_receber').insert({
            numero_conta: numero,
            cliente_id: Number(form.cliente_id),
            descricao: form.descricao ? `${form.descricao} - Parcela ${i + 1}/${n}` : `Parcela ${i + 1}/${n}`,
            valor: valorCentavos / 100,
            data_vencimento: vencimento.toISOString().slice(0, 10),
            observacoes: form.observacoes || null,
            status: 'Em aberto',
          });
          if (error) throw error;
        }
        setModalAberto(false);
        qc.invalidateQueries({ queryKey: ['contas-receber'] });
      } catch (e) {
        setErro(mensagemErro(e));
      } finally {
        setSalvando(false);
      }
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

  async function alterarVencimento(c: ContaReceber, novaData: string) {
    if (!novaData || novaData === c.data_vencimento) return;
    const { error } = await supabase.from('contas_receber').update({ data_vencimento: novaData }).eq('id', c.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['contas-receber'] });
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

  function abrirEdicaoData(c: ContaReceber) {
    setContaEditandoData(c);
    setNovaDataRecebimento(c.data_recebimento ?? '');
    setErroData(null);
  }

  async function salvarDataRecebimento() {
    if (!contaEditandoData) return;
    if (!novaDataRecebimento) {
      setErroData('Informe a data de recebimento.');
      return;
    }
    setErroData(null);
    setSalvandoData(true);
    try {
      const { error } = await supabase
        .from('contas_receber')
        .update({ data_recebimento: novaDataRecebimento })
        .eq('id', contaEditandoData.id);
      if (error) throw error;
      setContaEditandoData(null);
      qc.invalidateQueries({ queryKey: ['contas-receber'] });
    } catch (e) {
      setErroData(mensagemErro(e));
    } finally {
      setSalvandoData(false);
    }
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

  // Edição rápida dos dados da NF direto daqui - útil pra corrigir uma NF
  // já lançada (ex.: preencher a data de emissão que ficou em branco, sem
  // a qual essa NF não aparece no Relatório de peças utilizadas).
  function abrirEdicaoNF(c: ContaReceber) {
    setContaEditandoNF(c);
    setFormNF({
      nf_tipo: c.nf_tipo ?? 'NFS-e',
      nf_numero: c.nf_numero ?? '',
      nf_serie: c.nf_serie ?? '',
      nf_chave_acesso: c.nf_chave_acesso ?? '',
      nf_data_emissao: c.nf_data_emissao ?? '',
    });
    setErroNF(null);
  }

  async function salvarNF() {
    if (!contaEditandoNF) return;
    if (!formNF.nf_numero) {
      setErroNF('Informe o número da nota.');
      return;
    }
    setErroNF(null);
    setSalvandoNF(true);
    try {
      const { error } = await supabase
        .from('contas_receber')
        .update({
          nf_tipo: formNF.nf_tipo,
          nf_numero: formNF.nf_numero,
          nf_serie: formNF.nf_serie || null,
          nf_chave_acesso: formNF.nf_chave_acesso ? formNF.nf_chave_acesso.replace(/\D/g, '') : null,
          nf_data_emissao: formNF.nf_data_emissao || null,
        })
        .eq('id', contaEditandoNF.id);
      if (error) throw error;
      setContaEditandoNF(null);
      qc.invalidateQueries({ queryKey: ['contas-receber'] });
    } catch (e) {
      setErroNF(mensagemErro(e));
    } finally {
      setSalvandoNF(false);
    }
  }

  // Fica ANTES do "if isLoading" porque useLinhasOrdenadas é um hook - não
  // pode ser chamado condicionalmente.
  function valorColuna(c: ContaReceber, chave: string): unknown {
    if (chave === 'codigo_entrada') return c.orcamentos ? codigoEntradaPorOS.get(c.orcamentos.ordem_servico_id) ?? '' : '';
    if (chave === 'numero_os') return c.orcamentos?.ordens_servico?.numero_os ?? '';
    if (chave === 'numero_orcamento') return c.orcamentos?.numero_orcamento ?? '';
    if (chave === 'cliente') return nomeCliente(c.cliente_id);
    if (chave === 'data_vencimento') return c.data_vencimento;
    if (chave === 'status') return statusExibicao(c).texto;
    if (chave === 'nota_fiscal') return c.nf_numero ? `${c.nf_tipo ?? ''} ${c.nf_numero}${c.nf_serie ? '/' + c.nf_serie : ''}`.trim() : '';
    return (c as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (query.data ?? []).filter((c) =>
    COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(c, chave), chave)),
  );
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  if (query.isLoading || clientesQuery.isLoading) return <CarregandoTela />;

  const totalEmAberto = (query.data ?? [])
    .filter((c) => c.status === 'Em aberto')
    .reduce((soma, c) => soma + Number(c.valor), 0);

  async function exportarPdf() {
    setExportandoPdf(true);
    try {
      await exportarTabelaPdf({
        titulo: 'Contas a receber',
        subtitulo: `Total em aberto: R$ ${totalEmAberto.toFixed(2)}`,
        colunas: [
          { label: 'Entrada' },
          { label: 'OS' },
          { label: 'Orçamento' },
          { label: 'Nº conta' },
          { label: 'Cliente', flex: 2 },
          { label: 'Descrição', flex: 2 },
          { label: 'Valor', alinhamento: 'right' },
          { label: 'Vencimento' },
          { label: 'Status' },
          { label: 'Nota fiscal' },
        ],
        linhas: linhas.map((c) => [
          String(valorColuna(c, 'codigo_entrada') || '-'),
          String(valorColuna(c, 'numero_os') || '-'),
          String(valorColuna(c, 'numero_orcamento') || '-'),
          c.numero_conta,
          nomeCliente(c.cliente_id),
          c.descricao ?? '',
          `R$ ${Number(c.valor).toFixed(2)}`,
          new Date(c.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR'),
          statusExibicao(c).texto,
          c.nf_numero ? `${c.nf_tipo ?? ''} ${c.nf_numero}${c.nf_serie ? '/' + c.nf_serie : ''}`.trim() : '-',
        ]),
        nomeArquivo: 'contas-a-receber',
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
        <h1>Contas a receber</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {algumFiltroAtivo && (
            <button className="botao-secundario botao-pequeno" onClick={limparTudo}>
              Limpar filtros
            </button>
          )}
          <button className="botao-secundario botao-pequeno" onClick={exportarPdf} disabled={exportandoPdf}>
            <IconFileTypePdf size={16} /> {exportandoPdf ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>
          <button className="botao-primario botao-pequeno" onClick={abrirNova}>
            <IconPlus size={16} /> Novo lançamento
          </button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Contas de orçamentos aprovados são lançadas automaticamente aqui. Total em aberto: R$ {totalEmAberto.toFixed(2)}
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['codigo_entrada', 'Entrada'],
              ['numero_os', 'OS'],
              ['numero_orcamento', 'Orçamento'],
              ['numero_conta', 'Nº conta'],
              ['cliente', 'Cliente'],
              ['descricao', 'Descrição'],
              ['valor', 'Valor'],
              ['data_vencimento', 'Vencimento'],
              ['status', 'Status'],
              ['nota_fiscal', 'Nota fiscal'],
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
                new Set((query.data ?? []).map((c) => String(valorColuna(c, chave) ?? ''))),
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
          {linhas.map((c) => {
            const st = statusExibicao(c);
            return (
              <tr key={c.id}>
                <td>
                  {c.orcamentos ? (
                    <span
                      className="link-numero mono"
                      onClick={() => navigate(`/registro-entrada?os=${c.orcamentos!.ordem_servico_id}`)}
                    >
                      {codigoEntradaPorOS.get(c.orcamentos.ordem_servico_id) ?? '-'}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  {c.orcamentos ? (
                    <span
                      className="link-numero mono"
                      title="Abrir orçamento técnico desta OS"
                      onClick={() => navigate(`/orcamento-tecnico?os=${c.orcamentos!.ordem_servico_id}`)}
                    >
                      {c.orcamentos.ordens_servico?.numero_os ?? '-'}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  {c.orcamentos ? (
                    <span
                      className="link-numero mono"
                      title="Abrir no Financeiro"
                      onClick={() => navigate(`/orcamento-financeiro?orcamento=${c.orcamento_id}`)}
                    >
                      {c.orcamentos.numero_orcamento}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="mono">{c.numero_conta}</td>
                <td>{nomeCliente(c.cliente_id)}</td>
                <td>{c.descricao}</td>
                <td>R$ {Number(c.valor).toFixed(2)}</td>
                <td>
                  <input
                    type="date"
                    value={c.data_vencimento}
                    onChange={(e) => alterarVencimento(c, e.target.value)}
                    style={{ width: 140 }}
                  />
                </td>
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
                <td>{c.nf_numero ? `${c.nf_tipo ?? ''} ${c.nf_numero}${c.nf_serie ? '/' + c.nf_serie : ''}`.trim() : '-'}</td>
                <td className="acoes-tabela">
                  {c.status === 'Recebido' && (
                    <button className="botao-icone" title="Alterar data de recebimento" onClick={() => abrirEdicaoData(c)}>
                      <IconCalendar size={16} />
                    </button>
                  )}
                  <button className="botao-icone" title="Editar dados da NF" onClick={() => abrirEdicaoNF(c)}>
                    <IconPencil size={16} />
                  </button>
                  <button className="botao-icone perigo" title="Excluir" onClick={() => excluir(c.id, c.numero_conta)}>
                    <IconTrash size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={11}>Nenhuma conta encontrada.</td>
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

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '12px 0' }}>
              <input
                type="checkbox"
                checked={form.parcelado}
                onChange={(e) => setForm((f) => ({ ...f, parcelado: e.target.checked }))}
              />
              Pagamento parcelado
            </label>

            {form.parcelado ? (
              <>
                <div className="campo-form">
                  <label>Valor total (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.valorTotal}
                    onChange={(e) => setForm((f) => ({ ...f, valorTotal: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="campo-form" style={{ flex: 1 }}>
                    <label>Nº de parcelas *</label>
                    <input
                      type="number"
                      min="1"
                      value={form.numParcelas}
                      onChange={(e) => setForm((f) => ({ ...f, numParcelas: e.target.value }))}
                    />
                  </div>
                  <div className="campo-form" style={{ flex: 1 }}>
                    <label>Vencimento da 1ª parcela *</label>
                    <input
                      type="date"
                      value={form.primeiroVencimento}
                      onChange={(e) => setForm((f) => ({ ...f, primeiroVencimento: e.target.value }))}
                    />
                  </div>
                  <div className="campo-form" style={{ flex: 1 }}>
                    <label>Intervalo</label>
                    <select
                      value={form.intervaloDias}
                      onChange={(e) => setForm((f) => ({ ...f, intervaloDias: e.target.value }))}
                    >
                      <option value="30">30 em 30 dias</option>
                      <option value="28">28 em 28 dias</option>
                      <option value="15">15 em 15 dias</option>
                      <option value="7">7 em 7 dias</option>
                    </select>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                  Divide o valor total em partes iguais (a última parcela absorve o centavo de arredondamento, se
                  houver) e cria um lançamento de "Contas a receber" pra cada parcela, todas como "Em aberto".
                </p>
              </>
            ) : (
              <>
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
              </>
            )}

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
                {salvando ? 'Salvando...' : form.parcelado ? 'Gerar parcelas' : 'Salvar'}
              </button>
            </div>
        </ModalJanela>
      )}

      {contaEditandoNF && (
        <ModalJanela titulo={`Editar NF - ${contaEditandoNF.numero_conta}`} aoFechar={() => setContaEditandoNF(null)}>
            <div className="campo-form">
              <label>Tipo</label>
              <select value={formNF.nf_tipo} onChange={(e) => setFormNF((f) => ({ ...f, nf_tipo: e.target.value }))}>
                <option value="NFS-e">NFS-e (serviço)</option>
                <option value="NF-e">NF-e (produto)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Número *</label>
                <input
                  type="text"
                  value={formNF.nf_numero}
                  onChange={(e) => setFormNF((f) => ({ ...f, nf_numero: e.target.value }))}
                />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Série</label>
                <input
                  type="text"
                  value={formNF.nf_serie}
                  onChange={(e) => setFormNF((f) => ({ ...f, nf_serie: e.target.value }))}
                />
              </div>
            </div>
            <div className="campo-form">
              <label>Chave de acesso</label>
              <input
                type="text"
                maxLength={44}
                value={formNF.nf_chave_acesso}
                onChange={(e) => setFormNF((f) => ({ ...f, nf_chave_acesso: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Data de emissão *</label>
              <input
                type="date"
                value={formNF.nf_data_emissao}
                onChange={(e) => setFormNF((f) => ({ ...f, nf_data_emissao: e.target.value }))}
              />
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Sem essa data a NF não aparece no Relatório de peças utilizadas (Comercial).
              </p>
            </div>

            {erroNF && <p className="erro-login">{erroNF}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setContaEditandoNF(null)} disabled={salvandoNF}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={salvarNF} disabled={salvandoNF}>
                {salvandoNF ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
        </ModalJanela>
      )}

      {contaEditandoData && (
        <ModalJanela titulo={`Alterar data de recebimento — ${contaEditandoData.numero_conta}`} aoFechar={() => setContaEditandoData(null)}>
          <div className="campo-form">
            <label>Data de recebimento *</label>
            <input type="date" value={novaDataRecebimento} onChange={(e) => setNovaDataRecebimento(e.target.value)} />
          </div>

          {erroData && <p className="erro-login">{erroData}</p>}

          <div className="modal-acoes">
            <button className="botao-secundario" onClick={() => setContaEditandoData(null)} disabled={salvandoData}>
              Cancelar
            </button>
            <button className="botao-primario" onClick={salvarDataRecebimento} disabled={salvandoData}>
              {salvandoData ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </ModalJanela>
      )}
    </div>
  );
}
