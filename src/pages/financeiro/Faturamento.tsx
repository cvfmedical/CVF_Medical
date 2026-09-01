import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { linkEmail } from '../../lib/compartilhar';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { STATUS_PRONTO_ENTREGA } from '../../lib/statusOS';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { ComboboxBusca } from '../../components/ComboboxBusca';
import { useConfirmarSenha } from '../../lib/useConfirmarSenha';
import { useEntradaOrcamentoPorOS } from '../../lib/useEntradaOrcamentoPorOS';
import { totalOrcamento } from '../../lib/valorOrcamento';
import { quintoDiaUtilMesSeguinte } from '../../lib/diaUtil';

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
  nfse_status: string | null;
  nfse_erro_detalhe: string | null;
  orcamentos: {
    numero_orcamento: string;
    ordem_servico_id: number;
    ordens_servico: { numero_os: string } | null;
  } | null;
}

interface OrcamentoAprovado {
  id: number;
  numero_orcamento: string;
  ordem_servico_id: number;
  ordens_servico: { numero_os: string; cliente_id: number; cliente_nome: string; status_os: string | null } | null;
  orcamento_itens: { preco_unitario: number | null; quantidade: number }[];
  // Quando precificado por valor fixo (por modelo de ótica ou por
  // modalidade de manutenção - OrcamentoFinanceiro.tsx), os itens ficam
  // com preço zerado de propósito (só de referência) e o valor de verdade
  // vem daqui, não da soma dos itens.
  valor_fixo_contrato: number | null;
  desconto: number | null;
  bonificacao: boolean | null;
}

// Linha unificada da tabela: ou já existe uma conta a receber lançada
// (contaId preenchido), ou é um orçamento aprovado que ainda não tem NF/
// conta nenhuma (contaId nulo - "Lançar NF" cria a conta a receber nessa
// hora, com os dados de NF/boleto de uma vez só).
interface LinhaFaturamento {
  chave: string;
  contaId: number | null;
  orcamentoId: number | null;
  ordemServicoId: number | null;
  numeroOS: string | null;
  numeroOrcamento: string | null;
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
  nfseStatus: string | null;
  nfseErroDetalhe: string | null;
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

interface ParcelaForm {
  valor: string;
  boleto_numero: string;
  boleto_linha_digitavel: string;
  boleto_vencimento: string;
}

function parcelaVazia(valor = ''): ParcelaForm {
  return { valor, boleto_numero: '', boleto_linha_digitavel: '', boleto_vencimento: '' };
}

function liberada(statusOS: string | null): boolean {
  return statusOS === STATUS_PRONTO_ENTREGA || statusOS === STATUS_ENTREGUE;
}

const COLUNAS_FILTRAVEIS = ['codigo_entrada', 'numero_os', 'numero_orcamento', 'numero', 'cliente', 'descricao', 'valor', 'nota_fiscal'];

export function Faturamento() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Alíquota do ISS e percentual total de tributos do Simples Nacional -
  // a contabilidade reenvia os dois todo mês (recalculados em cima do
  // faturamento). Ficam guardados aqui pra não precisar caçar e-mail
  // antigo toda vez que for emitir uma NFS-e.
  const aliquotaIssQuery = useQuery({
    queryKey: ['configuracao-fiscal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracao_fiscal')
        .select('aliquota_iss, percentual_total_tributos_sn, atualizado_em')
        .eq('id', 1)
        .single();
      if (error) throw error;
      return data as { aliquota_iss: number | null; percentual_total_tributos_sn: number | null; atualizado_em: string | null };
    },
  });
  const [editandoAliquota, setEditandoAliquota] = useState(false);
  const [novaAliquota, setNovaAliquota] = useState('');
  const [salvandoAliquota, setSalvandoAliquota] = useState(false);
  const [editandoTotalTributos, setEditandoTotalTributos] = useState(false);
  const [novoTotalTributos, setNovoTotalTributos] = useState('');
  const [salvandoTotalTributos, setSalvandoTotalTributos] = useState(false);

  function abrirEdicaoAliquota() {
    setNovaAliquota(String(aliquotaIssQuery.data?.aliquota_iss ?? ''));
    setEditandoAliquota(true);
  }

  async function salvarAliquota() {
    const valor = Number(novaAliquota);
    if (!novaAliquota || Number.isNaN(valor) || valor <= 0) {
      alert('Informe uma alíquota válida.');
      return;
    }
    setSalvandoAliquota(true);
    try {
      const { error } = await supabase
        .from('configuracao_fiscal')
        .update({ aliquota_iss: valor, atualizado_em: new Date().toISOString().slice(0, 10) })
        .eq('id', 1);
      if (error) throw error;
      setEditandoAliquota(false);
      qc.invalidateQueries({ queryKey: ['configuracao-fiscal'] });
    } catch (e) {
      alert(mensagemErro(e));
    } finally {
      setSalvandoAliquota(false);
    }
  }

  function abrirEdicaoTotalTributos() {
    setNovoTotalTributos(String(aliquotaIssQuery.data?.percentual_total_tributos_sn ?? ''));
    setEditandoTotalTributos(true);
  }

  async function salvarTotalTributos() {
    const valor = Number(novoTotalTributos);
    if (!novoTotalTributos || Number.isNaN(valor) || valor <= 0) {
      alert('Informe um percentual válido.');
      return;
    }
    setSalvandoTotalTributos(true);
    try {
      const { error } = await supabase
        .from('configuracao_fiscal')
        .update({ percentual_total_tributos_sn: valor, atualizado_em: new Date().toISOString().slice(0, 10) })
        .eq('id', 1);
      if (error) throw error;
      setEditandoTotalTributos(false);
      qc.invalidateQueries({ queryKey: ['configuracao-fiscal'] });
    } catch (e) {
      alert(mensagemErro(e));
    } finally {
      setSalvandoTotalTributos(false);
    }
  }
  const { codigoEntradaPorOS } = useEntradaOrcamentoPorOS();
  const [searchParams] = useSearchParams();
  const [linhaSelecionada, setLinhaSelecionada] = useState<LinhaFaturamento | null>(null);
  const [form, setForm] = useState(formVazio);
  // Parcelamento só é escolhido na hora de lançar a NF (conta nova) - uma
  // vez lançada, cada parcela vira sua própria conta a receber e é editada
  // separadamente dali pra frente, como qualquer outra conta.
  const [parcelado, setParcelado] = useState(false);
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([]);
  // Geração automática das parcelas - em vez do usuário calcular valor e
  // vencimento de cada uma na mão, ele só diz quantas parcelas, o
  // vencimento da 1ª e o intervalo entre elas (30 ou 28 dias, ou outro).
  const [numParcelasAuto, setNumParcelasAuto] = useState('2');
  const [primeiroVencimentoAuto, setPrimeiroVencimentoAuto] = useState('');
  const [intervaloDiasAuto, setIntervaloDiasAuto] = useState('30');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [emitindoNfseId, setEmitindoNfseId] = useState<number | null>(null);
  // Evita reabrir sozinho se o usuário fechar o modal manualmente - só abre
  // uma vez por chegada vinda do link "Lançar NF" do Orçamento Financeiro.
  const abriuAutomaticoRef = useRef(false);
  const { pedirConfirmacao, ModalConfirmacao } = useConfirmarSenha();
  // "Pular etapa": pra equipamentos cuja NF já foi emitida por fora do
  // sistema (Nota Control) enquanto a OS ainda está presa numa etapa
  // anterior do pipeline aqui dentro - marca como entregue e libera pra
  // faturar, sem precisar passar pelas telas de teste/entrega uma a uma.
  const [orcamentoParaPular, setOrcamentoParaPular] = useState('');
  const [pulandoEtapa, setPulandoEtapa] = useState(false);
  // Já faturado some da tabela por padrão - só volta quando o usuário quer
  // consultar (não é mais uma pendência de ação).
  const [mostrarFaturados, setMostrarFaturados] = useState(false);
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();

  const contasQuery = useQuery({
    queryKey: ['faturamento-contas-receber'],
    queryFn: async (): Promise<ContaReceber[]> => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select(
          'id, numero_conta, orcamento_id, cliente_id, descricao, valor, status, nf_tipo, nf_numero, nf_serie, nf_chave_acesso, nf_data_emissao, boleto_numero, boleto_linha_digitavel, boleto_vencimento, nfse_status, nfse_erro_detalhe, orcamentos(numero_orcamento, ordem_servico_id, ordens_servico(numero_os))',
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
          'id, numero_orcamento, ordem_servico_id, valor_fixo_contrato, desconto, bonificacao, ordens_servico(numero_os, cliente_id, cliente_nome, status_os), orcamento_itens(preco_unitario, quantidade)',
        )
        .eq('status', 'Aprovado');
      if (error) throw error;
      return data as unknown as OrcamentoAprovado[];
    },
  });

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-faturamento'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social, email, faturamento_pecas_diferido');
      if (error) throw error;
      return data as { id: number; razao_social: string; email: string | null; faturamento_pecas_diferido: boolean }[];
    },
  });

  const orcamentosComConta = new Set((contasQuery.data ?? []).map((c) => c.orcamento_id).filter((id): id is number => id != null));

  const linhas: LinhaFaturamento[] = [
    ...(contasQuery.data ?? []).map((c): LinhaFaturamento => ({
      chave: `cr-${c.id}`,
      contaId: c.id,
      orcamentoId: c.orcamento_id,
      ordemServicoId: c.orcamentos?.ordem_servico_id ?? null,
      numeroOS: c.orcamentos?.ordens_servico?.numero_os ?? null,
      numeroOrcamento: c.orcamentos?.numero_orcamento ?? null,
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
      nfseStatus: c.nfse_status,
      nfseErroDetalhe: c.nfse_erro_detalhe,
    })),
    ...(orcamentosQuery.data ?? [])
      // Garantia e bonificação (cortesia) somam R$ 0,00 - não há o que
      // faturar, o processo termina na entrega ao cliente, sem passar
      // por aqui.
      .filter((o) => !orcamentosComConta.has(o.id) && totalOrcamento(o) > 0)
      .map((o): LinhaFaturamento => {
        const valor = totalOrcamento(o);
        return {
          chave: `orc-${o.id}`,
          contaId: null,
          orcamentoId: o.id,
          ordemServicoId: o.ordem_servico_id,
          numeroOS: o.ordens_servico?.numero_os ?? null,
          numeroOrcamento: o.numero_orcamento,
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
          nfseStatus: null,
          nfseErroDetalhe: null,
        };
      }),
  ];

  // A tela é sobre a AÇÃO de faturar - só faz sentido mostrar o que já é
  // acionável aqui: contas já lançadas (faturadas ou não) e orçamentos
  // aprovados cujo equipamento já está pronto/entregue. Orçamentos aprovados
  // ainda "Aguardando entrega" pertencem a uma etapa anterior do pipeline e
  // não devem poluir esta tabela.
  const linhasAcionaveis = linhas.filter((l) => l.contaId != null || liberada(l.statusOS));

  const liberadas = linhasAcionaveis.filter((l) => !l.nf_numero && (l.contaId == null ? liberada(l.statusOS) : true));

  // Já faturado sai da tabela principal por padrão (aqui é fila de ação,
  // não histórico) - "Mostrar faturados" liga de volta só pra consulta.
  const linhasParaFaturar = linhasAcionaveis.filter((l) => mostrarFaturados || !l.nf_numero);

  function nomeCliente(id: number | null) {
    return id ? clientesQuery.data?.find((c) => c.id === id)?.razao_social ?? `#${id}` : '-';
  }

  // Orçamentos aprovados que ficaram presos numa etapa anterior do
  // pipeline mas que, na vida real, o equipamento já foi entregue e a NF
  // já foi emitida por fora (Nota Control) - candidatos ao "Pular etapa".
  const naoLiberadas = (orcamentosQuery.data ?? []).filter(
    (o) => !orcamentosComConta.has(o.id) && !liberada(o.ordens_servico?.status_os ?? null) && totalOrcamento(o) > 0,
  );
  const opcoesPular = naoLiberadas.map((o) => ({
    value: String(o.id),
    label: `${o.numero_orcamento} - OS ${o.ordens_servico?.numero_os ?? '?'} - ${nomeCliente(o.ordens_servico?.cliente_id ?? null)} (${o.ordens_servico?.status_os ?? '-'})`,
  }));

  // Mesma lógica usada pro badge da coluna "Nota fiscal" - reaproveitada
  // aqui pra poder ordenar/filtrar por esse status derivado.
  function labelNotaFiscal(l: LinhaFaturamento): string {
    if (l.nf_numero) return `Faturado ${l.nf_tipo ?? ''} ${l.nf_numero}${l.nf_serie ? '/' + l.nf_serie : ''}`.trim();
    if (l.contaId == null && liberada(l.statusOS)) return 'Liberado';
    if (l.contaId == null) return 'Aguardando entrega';
    return 'Não faturado';
  }

  function valorColuna(l: LinhaFaturamento, chave: string): unknown {
    if (chave === 'cliente') return nomeCliente(l.clienteId);
    if (chave === 'nota_fiscal') return labelNotaFiscal(l);
    if (chave === 'codigo_entrada') return (l.ordemServicoId != null ? codigoEntradaPorOS.get(l.ordemServicoId) : null) ?? '';
    if (chave === 'numero_os') return l.numeroOS ?? '';
    if (chave === 'numero_orcamento') return l.numeroOrcamento ?? '';
    return (l as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = linhasParaFaturar.filter((l) =>
    COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(l, chave), chave)),
  );
  const {
    linhasOrdenadas: linhasOrdenadasFiltradas,
    coluna,
    direcao,
    ordenarPor,
  } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

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
    setParcelado(false);
    setParcelas([]);
    setNumParcelasAuto('2');
    setPrimeiroVencimentoAuto('');
    setIntervaloDiasAuto('30');
    setErro(null);
  }

  // Marca a OS como entregue (sem passar pelas telas de teste/entrega) e
  // já abre "Lançar NF" em seguida - pra equipamentos cuja entrega e NF
  // já aconteceram na vida real, fora do sistema.
  function pularEtapa() {
    const orc = naoLiberadas.find((o) => String(o.id) === orcamentoParaPular);
    if (!orc || !orc.ordens_servico) return;
    const numeroOS = orc.ordens_servico.numero_os;
    pedirConfirmacao(
      async () => {
        setPulandoEtapa(true);
        setErro(null);
        try {
          const { error } = await supabase
            .from('ordens_servico')
            .update({ status_os: STATUS_ENTREGUE })
            .eq('id', orc.ordem_servico_id);
          if (error) throw error;
          await qc.invalidateQueries({ queryKey: ['faturamento-orcamentos-aprovados'] });
          qc.invalidateQueries({ queryKey: ['ordens-servico-painel'] });
          qc.invalidateQueries({ queryKey: ['os-em-execucao'] });
          setOrcamentoParaPular('');
        } catch (e) {
          setErro(mensagemErro(e));
        } finally {
          setPulandoEtapa(false);
        }
      },
      {
        titulo: 'Pular etapa e liberar para faturamento',
        mensagem: `Confirma que o equipamento da OS ${numeroOS} já foi entregue ao cliente e a NF já foi emitida fora do sistema? O status da OS vai virar "Entregue ao cliente" e o orçamento passa a aparecer na lista abaixo pra lançar a NF.`,
      },
    );
  }

  function adicionarParcela() {
    setParcelas((p) => [...p, parcelaVazia()]);
  }
  function removerParcela(i: number) {
    setParcelas((p) => p.filter((_, idx) => idx !== i));
  }

  // Gera todas as parcelas de uma vez - o usuário só informa quantas
  // parcelas, o vencimento da 1ª e o intervalo entre elas (30 dias, 28
  // dias, ou outro número); valor e data de cada parcela saem sozinhos.
  // A última parcela absorve o resto do arredondamento em centavos, pra
  // soma bater certinho com o valor total (mesma prática usada em boletos
  // reais).
  function gerarParcelasAutomatico() {
    if (!linhaSelecionada) return;
    const n = Number(numParcelasAuto);
    if (!n || n < 1) {
      setErro('Informe um número de parcelas válido.');
      return;
    }
    if (!primeiroVencimentoAuto) {
      setErro('Informe o vencimento da 1ª parcela.');
      return;
    }
    const intervalo = Number(intervaloDiasAuto) || 30;
    const totalCentavos = Math.round(linhaSelecionada.valor * 100);
    const baseCentavos = Math.floor(totalCentavos / n);
    const restoCentavos = totalCentavos - baseCentavos * n;

    const novasParcelas: ParcelaForm[] = [];
    for (let i = 0; i < n; i++) {
      const valorCentavos = baseCentavos + (i === n - 1 ? restoCentavos : 0);
      const vencimento = new Date(`${primeiroVencimentoAuto}T00:00:00`);
      vencimento.setDate(vencimento.getDate() + intervalo * i);
      novasParcelas.push({
        valor: (valorCentavos / 100).toFixed(2),
        boleto_numero: '',
        boleto_linha_digitavel: '',
        boleto_vencimento: vencimento.toISOString().slice(0, 10),
      });
    }
    setParcelas(novasParcelas);
    setErro(null);
  }
  function atualizarParcela(i: number, campo: keyof ParcelaForm, valor: string) {
    setParcelas((p) => p.map((parc, idx) => (idx === i ? { ...parc, [campo]: valor } : parc)));
  }
  const somaParcelas = parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0);

  // Vindo do botão "Lançar NF" do Orçamento Financeiro (?orcamento=ID) - abre
  // direto o modal já com os dados desse orçamento, só faltando NF/boleto.
  useEffect(() => {
    if (abriuAutomaticoRef.current) return;
    const orcamentoParam = searchParams.get('orcamento');
    if (!orcamentoParam) return;
    const linha = linhas.find((l) => l.orcamentoId === Number(orcamentoParam));
    if (!linha) return;
    abriuAutomaticoRef.current = true;
    abrirLancarNota(linha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, linhas]);

  async function salvarNota() {
    if (!linhaSelecionada) return;
    setErro(null);
    if (!form.nf_numero) {
      setErro('Informe o número da nota.');
      return;
    }
    if (!form.nf_data_emissao) {
      // Sem isso, o "Relatório de peças utilizadas" (Comercial) não
      // encontra essa NF na hora de filtrar por mês - a data de emissão é
      // o campo usado pra saber em que mês a nota entra no relatório.
      setErro('Informe a data de emissão da nota - sem ela a NF não aparece no Relatório de peças utilizadas.');
      return;
    }
    if (parcelado) {
      if (parcelas.length === 0) {
        setErro('Adicione pelo menos uma parcela, ou desmarque "Pagamento parcelado".');
        return;
      }
      if (parcelas.some((p) => !p.valor || !p.boleto_vencimento)) {
        setErro('Preencha valor e vencimento de todas as parcelas.');
        return;
      }
      if (Math.abs(somaParcelas - linhaSelecionada.valor) > 0.01) {
        setErro(
          `A soma das parcelas (R$ ${somaParcelas.toFixed(2)}) precisa bater com o valor total (R$ ${linhaSelecionada.valor.toFixed(2)}).`,
        );
        return;
      }
    }
    const clientePecasDiferido =
      clientesQuery.data?.find((c) => c.id === linhaSelecionada.clienteId)?.faturamento_pecas_diferido ?? false;

    setSalvando(true);
    try {
      const camposNota = {
        nf_tipo: form.nf_tipo,
        nf_numero: form.nf_numero,
        nf_serie: form.nf_serie || null,
        // 44 dígitos - remove espaços/pontos coladas como formatação de leitura.
        nf_chave_acesso: form.nf_chave_acesso ? form.nf_chave_acesso.replace(/\D/g, '') : null,
        nf_data_emissao: form.nf_data_emissao || null,
      };
      if (parcelado) {
        // Uma NF só, paga em N parcelas - cada parcela vira sua própria
        // conta a receber (mesma NF, mesmo orçamento), com vencimento e
        // boleto próprios - reaproveita 100% do controle de "Contas a
        // receber" já existente (cada parcela é baixada/recebida sozinha).
        if (linhaSelecionada.contaId) {
          // Já existia uma conta avulsa pra esse orçamento (lançamento
          // avulso ou criada antes da migração 056, ainda sem NF) - remove
          // ela pra dar lugar às N parcelas abaixo.
          const { error: erroRemover } = await supabase
            .from('contas_receber')
            .delete()
            .eq('id', linhaSelecionada.contaId);
          if (erroRemover) throw erroRemover;
        }
        for (let i = 0; i < parcelas.length; i++) {
          const p = parcelas[i];
          const numeroConta = await gerarNumeroSequencial('CR', 'contas_receber', 'numero_conta');
          const { error } = await supabase.from('contas_receber').insert({
            numero_conta: numeroConta,
            orcamento_id: linhaSelecionada.orcamentoId,
            cliente_id: linhaSelecionada.clienteId,
            descricao: `${linhaSelecionada.descricao} - Parcela ${i + 1}/${parcelas.length}`,
            valor: Number(p.valor),
            data_vencimento: p.boleto_vencimento,
            status: 'Em aberto',
            ...camposNota,
            boleto_numero: p.boleto_numero || null,
            boleto_linha_digitavel: p.boleto_linha_digitavel || null,
            boleto_vencimento: p.boleto_vencimento,
          });
          if (error) throw error;
        }
      } else if (linhaSelecionada.contaId) {
        // Conta já existia (lançamento avulso ou criada antes da migração
        // 056) e não é parcelado - só atualiza os dados de NF/boleto.
        const { error } = await supabase
          .from('contas_receber')
          .update({
            ...camposNota,
            boleto_numero: form.boleto_numero || null,
            boleto_linha_digitavel: form.boleto_linha_digitavel || null,
            boleto_vencimento: form.boleto_vencimento || null,
          })
          .eq('id', linhaSelecionada.contaId);
        if (error) throw error;
      } else if (clientePecasDiferido) {
        // Grupo Cortical (e outros clientes com faturamento diferido de
        // peças): a NF de serviço emitida agora cobre só a mão de obra;
        // as peças usadas nessa OS só são pagas no 5º dia útil do mês
        // seguinte, apuradas à parte no Relatório de peças utilizadas -
        // por isso vira DUAS contas, não uma, pra não mostrar como "a
        // receber" agora um valor que só cai no caixa mês que vem.
        const { data: orcamentoRow, error: erroOrc } = await supabase
          .from('orcamentos')
          .select('valor_fixo_contrato')
          .eq('id', linhaSelecionada.orcamentoId)
          .single();
        if (erroOrc) throw erroOrc;
        const { data: itens, error: erroItens } = await supabase
          .from('orcamento_itens')
          .select('preco_unitario, quantidade, produtos_servicos(tipo)')
          .eq('orcamento_id', linhaSelecionada.orcamentoId);
        if (erroItens) throw erroItens;

        let valorServico = orcamentoRow?.valor_fixo_contrato ? Number(orcamentoRow.valor_fixo_contrato) : 0;
        let valorPecas = 0;
        for (const it of (itens ?? []) as unknown as {
          preco_unitario: number | null;
          quantidade: number;
          produtos_servicos: { tipo: string | null } | null;
        }[]) {
          const totalItem = (it.preco_unitario ?? 0) * it.quantidade;
          if (it.produtos_servicos?.tipo === 'Peça' || it.produtos_servicos?.tipo === 'Produto') {
            valorPecas += totalItem;
          } else {
            valorServico += totalItem;
          }
        }

        const numeroContaServico = await gerarNumeroSequencial('CR', 'contas_receber', 'numero_conta');
        const vencimentoServico = new Date();
        vencimentoServico.setDate(vencimentoServico.getDate() + 30);
        const { error: erroServico } = await supabase.from('contas_receber').insert({
          numero_conta: numeroContaServico,
          orcamento_id: linhaSelecionada.orcamentoId,
          cliente_id: linhaSelecionada.clienteId,
          descricao: `${linhaSelecionada.descricao} (mão de obra)`,
          valor: valorServico,
          data_vencimento: vencimentoServico.toISOString().slice(0, 10),
          status: 'Em aberto',
          ...camposNota,
          boleto_numero: form.boleto_numero || null,
          boleto_linha_digitavel: form.boleto_linha_digitavel || null,
          boleto_vencimento: form.boleto_vencimento || null,
        });
        if (erroServico) throw erroServico;

        if (valorPecas > 0.01) {
          const numeroContaPecas = await gerarNumeroSequencial('CR', 'contas_receber', 'numero_conta');
          const dataEmissao = form.nf_data_emissao ? new Date(`${form.nf_data_emissao}T00:00:00`) : new Date();
          const vencimentoPecas = quintoDiaUtilMesSeguinte(dataEmissao);
          const { error: erroPecas } = await supabase.from('contas_receber').insert({
            numero_conta: numeroContaPecas,
            orcamento_id: linhaSelecionada.orcamentoId,
            cliente_id: linhaSelecionada.clienteId,
            descricao: `${linhaSelecionada.descricao} (peças)`,
            valor: valorPecas,
            data_vencimento: vencimentoPecas.toISOString().slice(0, 10),
            status: 'Em aberto',
          });
          if (erroPecas) throw erroPecas;
        }
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
          boleto_numero: form.boleto_numero || null,
          boleto_linha_digitavel: form.boleto_linha_digitavel || null,
          boleto_vencimento: form.boleto_vencimento || null,
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

  // Emissão automática de NFS-e pela Focus NFe - alternativa ao "Lançar
  // NF" manual (que continua existindo pra quando for preciso lançar uma
  // nota emitida por fora, ex.: Focus NFe fora do ar). Enquanto
  // "processando", o técnico usa "Verificar status" pra puxar o resultado
  // final (autorizada/erro) da Focus NFe.
  async function emitirNFSe(l: LinhaFaturamento) {
    if (!l.contaId) return;
    setEmitindoNfseId(l.contaId);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfse', {
        body: { contaId: l.contaId, acao: 'emitir' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao emitir NFS-e.');
      qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEmitindoNfseId(null);
    }
  }

  async function consultarStatusNFSe(l: LinhaFaturamento) {
    if (!l.contaId) return;
    setEmitindoNfseId(l.contaId);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfse', {
        body: { contaId: l.contaId, acao: 'consultar' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao consultar status.');
      qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEmitindoNfseId(null);
    }
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
      <div className="crud-cabecalho">
        <h1>Faturamento (NF-e / NFS-e)</h1>
        {algumFiltroAtivo && (
          <button className="botao-secundario botao-pequeno" onClick={limparTudo}>
            Limpar filtros
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Controle/registro apenas - a emissão da nota continua sendo feita fora do sistema (Mentora ou o site da
        prefeitura). A conta a receber é criada aqui mesmo, junto com os dados de NF e boleto, no momento do
        lançamento (antes disso o orçamento aprovado aparece como "Aguardando entrega"/"Liberado").
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            width: 'fit-content',
          }}
        >
          <span style={{ color: 'var(--ink-400)' }}>Alíquota ISS atual:</span>
          {editandoAliquota ? (
            <>
              <input
                type="number"
                step="0.01"
                value={novaAliquota}
                onChange={(e) => setNovaAliquota(e.target.value)}
                style={{ width: 80 }}
                autoFocus
              />
              <span>%</span>
              <button className="botao-primario botao-pequeno" onClick={salvarAliquota} disabled={salvandoAliquota}>
                {salvandoAliquota ? 'Salvando...' : 'Salvar'}
              </button>
              <button className="botao-secundario botao-pequeno" onClick={() => setEditandoAliquota(false)} disabled={salvandoAliquota}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <strong>
                {aliquotaIssQuery.data?.aliquota_iss != null ? `${Number(aliquotaIssQuery.data.aliquota_iss).toFixed(2)}%` : 'Não informada'}
              </strong>
              {aliquotaIssQuery.data?.atualizado_em && (
                <span style={{ color: 'var(--ink-400)' }}>
                  (atualizada em {new Date(aliquotaIssQuery.data.atualizado_em + 'T00:00:00').toLocaleDateString('pt-BR')})
                </span>
              )}
              <button className="botao-secundario botao-pequeno" onClick={abrirEdicaoAliquota}>
                Atualizar
              </button>
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            width: 'fit-content',
          }}
        >
          <span style={{ color: 'var(--ink-400)' }}>% Total de Tributos (Simples Nacional):</span>
          {editandoTotalTributos ? (
            <>
              <input
                type="number"
                step="0.01"
                value={novoTotalTributos}
                onChange={(e) => setNovoTotalTributos(e.target.value)}
                style={{ width: 80 }}
                autoFocus
              />
              <span>%</span>
              <button className="botao-primario botao-pequeno" onClick={salvarTotalTributos} disabled={salvandoTotalTributos}>
                {salvandoTotalTributos ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                className="botao-secundario botao-pequeno"
                onClick={() => setEditandoTotalTributos(false)}
                disabled={salvandoTotalTributos}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <strong>
                {aliquotaIssQuery.data?.percentual_total_tributos_sn != null
                  ? `${Number(aliquotaIssQuery.data.percentual_total_tributos_sn).toFixed(2)}%`
                  : 'Não informado'}
              </strong>
              <button className="botao-secundario botao-pequeno" onClick={abrirEdicaoTotalTributos}>
                Atualizar
              </button>
            </>
          )}
        </div>
      </div>

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

      {naoLiberadas.length > 0 && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
          }}
        >
          <strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            Pular etapa (equipamento já entregue e NF já emitida fora do sistema)
          </strong>
          <p style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 8 }}>
            Pra orçamentos aprovados cuja OS ainda está numa etapa anterior aqui dentro, mas que na vida real já foi
            entregue ao cliente. Marca a OS como entregue - o orçamento passa a aparecer na lista abaixo, como
            qualquer outro liberado, pra lançar a NF normalmente.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 320 }}>
              <ComboboxBusca
                opcoes={opcoesPular}
                valor={orcamentoParaPular}
                onChange={setOrcamentoParaPular}
                placeholder="Buscar orçamento/OS..."
              />
            </div>
            <button className="botao-secundario" onClick={pularEtapa} disabled={!orcamentoParaPular || pulandoEtapa}>
              {pulandoEtapa ? 'Processando...' : 'Pular etapa'}
            </button>
          </div>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={mostrarFaturados} onChange={(e) => setMostrarFaturados(e.target.checked)} />
        Mostrar já faturados (consulta)
      </label>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['codigo_entrada', 'Entrada'],
              ['numero_os', 'OS'],
              ['numero_orcamento', 'Orçamento'],
              ['numero', 'Nº'],
              ['cliente', 'Cliente'],
              ['descricao', 'Descrição'],
              ['valor', 'Valor'],
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
                new Set(linhasParaFaturar.map((l) => String(valorColuna(l, chave) ?? ''))),
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
          {linhasOrdenadasFiltradas.map((l) => (
            <tr key={l.chave}>
              <td>
                {l.ordemServicoId ? (
                  <span
                    className="link-numero mono"
                    onClick={() => navigate(`/registro-entrada?os=${l.ordemServicoId}`)}
                  >
                    {codigoEntradaPorOS.get(l.ordemServicoId) ?? '-'}
                  </span>
                ) : (
                  <span className="mono" style={{ color: 'var(--ink-400)' }}>
                    -
                  </span>
                )}
              </td>
              <td>
                {l.ordemServicoId ? (
                  <span
                    className="link-numero mono"
                    title="Abrir orçamento técnico desta OS"
                    onClick={() => navigate(`/orcamento-tecnico?os=${l.ordemServicoId}`)}
                  >
                    {l.numeroOS ?? '-'}
                  </span>
                ) : (
                  <span className="mono" style={{ color: 'var(--ink-400)' }}>
                    -
                  </span>
                )}
              </td>
              <td>
                {l.numeroOrcamento && l.orcamentoId ? (
                  <span
                    className="link-numero mono"
                    onClick={() => navigate(`/orcamento-tecnico?os=${l.ordemServicoId}&orcamento=${l.orcamentoId}`)}
                  >
                    {l.numeroOrcamento}
                  </span>
                ) : (
                  <span className="mono" style={{ color: 'var(--ink-400)' }}>
                    -
                  </span>
                )}
              </td>
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
                {!l.nf_numero && l.nfseStatus === 'processando' && (
                  <>
                    {' '}
                    <Badge tono="copper">NFS-e processando</Badge>
                  </>
                )}
                {!l.nf_numero && l.nfseStatus === 'erro' && (
                  <span title={l.nfseErroDetalhe ?? undefined}>
                    {' '}
                    <Badge tono="danger">Erro na NFS-e</Badge>
                  </span>
                )}
              </td>
              <td className="acoes-tabela">
                {l.contaId != null && !l.nf_numero && (!l.nfseStatus || l.nfseStatus === 'erro') && (
                  <button
                    className="botao-secundario"
                    onClick={() => emitirNFSe(l)}
                    disabled={emitindoNfseId === l.contaId}
                    title={l.nfseErroDetalhe ?? undefined}
                  >
                    {emitindoNfseId === l.contaId ? 'Emitindo...' : 'Emitir NFS-e'}
                  </button>
                )}
                {l.contaId != null && !l.nf_numero && l.nfseStatus === 'processando' && (
                  <button
                    className="botao-secundario"
                    onClick={() => consultarStatusNFSe(l)}
                    disabled={emitindoNfseId === l.contaId}
                  >
                    {emitindoNfseId === l.contaId ? 'Verificando...' : 'Verificar status'}
                  </button>
                )}
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
          {linhasOrdenadasFiltradas.length === 0 && (
            <tr>
              <td colSpan={9}>Nenhuma conta a receber ou orçamento aprovado encontrado.</td>
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
              <label>Data de emissão *</label>
              <input
                type="date"
                value={form.nf_data_emissao}
                onChange={(e) => setForm((f) => ({ ...f, nf_data_emissao: e.target.value }))}
              />
            </div>

            {!linhaSelecionada.nf_numero && (
              <div className="campo-form" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                <input
                  type="checkbox"
                  id="parcelado"
                  checked={parcelado}
                  onChange={(e) => setParcelado(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <label htmlFor="parcelado" style={{ marginBottom: 0 }}>
                  Pagamento parcelado?
                </label>
              </div>
            )}

            {parcelado ? (
              <>
                <h2 style={{ fontSize: 13, marginTop: 16 }}>Gerar parcelas automaticamente</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="campo-form" style={{ flex: 1 }}>
                    <label>Nº de parcelas</label>
                    <input
                      type="number"
                      min="1"
                      value={numParcelasAuto}
                      onChange={(e) => setNumParcelasAuto(e.target.value)}
                    />
                  </div>
                  <div className="campo-form" style={{ flex: 1 }}>
                    <label>Vencimento da 1ª parcela</label>
                    <input
                      type="date"
                      value={primeiroVencimentoAuto}
                      onChange={(e) => setPrimeiroVencimentoAuto(e.target.value)}
                    />
                  </div>
                  <div className="campo-form" style={{ flex: 1 }}>
                    <label>Intervalo entre parcelas</label>
                    <select value={intervaloDiasAuto} onChange={(e) => setIntervaloDiasAuto(e.target.value)}>
                      <option value="30">30 em 30 dias</option>
                      <option value="28">28 em 28 dias</option>
                      <option value="15">15 em 15 dias</option>
                      <option value="7">7 em 7 dias</option>
                    </select>
                  </div>
                </div>
                <button type="button" className="botao-primario botao-pequeno" onClick={gerarParcelasAutomatico}>
                  Gerar {numParcelasAuto || ''} parcelas
                </button>
                <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 6 }}>
                  Divide o valor total em partes iguais (a última parcela absorve o centavo de arredondamento, se
                  houver) e calcula o vencimento de cada uma. Depois de gerar, dá pra ajustar valor/vencimento/boleto
                  de cada parcela abaixo, se precisar.
                </p>

                <h2 style={{ fontSize: 13, marginTop: 16 }}>Parcelas / boletos</h2>
                {parcelas.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 12 }}>Parcela {i + 1}</strong>
                      <button
                        type="button"
                        className="botao-icone perigo"
                        title="Remover parcela"
                        onClick={() => removerParcela(i)}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div className="campo-form" style={{ flex: 1 }}>
                        <label>Valor (R$) *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={p.valor}
                          onChange={(e) => atualizarParcela(i, 'valor', e.target.value)}
                        />
                      </div>
                      <div className="campo-form" style={{ flex: 1 }}>
                        <label>Vencimento *</label>
                        <input
                          type="date"
                          value={p.boleto_vencimento}
                          onChange={(e) => atualizarParcela(i, 'boleto_vencimento', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="campo-form">
                      <label>Número do boleto</label>
                      <input
                        type="text"
                        value={p.boleto_numero}
                        onChange={(e) => atualizarParcela(i, 'boleto_numero', e.target.value)}
                      />
                    </div>
                    <div className="campo-form">
                      <label>Linha digitável</label>
                      <input
                        type="text"
                        value={p.boleto_linha_digitavel}
                        onChange={(e) => atualizarParcela(i, 'boleto_linha_digitavel', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
                <button type="button" className="botao-secundario botao-pequeno" onClick={adicionarParcela}>
                  + Adicionar parcela
                </button>
                <p
                  style={{
                    fontSize: 12,
                    marginTop: 8,
                    color: Math.abs(somaParcelas - linhaSelecionada.valor) > 0.01 ? 'var(--danger-500)' : 'var(--ink-400)',
                  }}
                >
                  Soma das parcelas: R$ {somaParcelas.toFixed(2)} de R$ {linhaSelecionada.valor.toFixed(2)}
                </p>
              </>
            ) : (
              <>
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
              </>
            )}

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
      {ModalConfirmacao}
    </div>
  );
}
