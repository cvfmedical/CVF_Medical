import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro, mensagemErroFuncao } from '../../lib/erros';
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
import { abrirPreviaDanfse } from '../../lib/previaDanfse';
import { IconTrash } from '@tabler/icons-react';
import { useRascunhoDeTela } from '../../lib/useRascunhoDeTela';
import { urlAssinadaDocumentoFinanceiro } from '../../lib/storage';
import { gerarAnexoOrcamentoSozinho, blobParaBase64, type DadosOrcamentoPdf, type AnexoBase64 } from '../../lib/pdfsOrcamento';
import { GARANTIA_CVF, CLAUSULAS_GERAIS, EMPRESA, formatarMoeda } from '../../lib/formato';
import { PORTAL_CLIENTE_URL } from '../../lib/compartilhar';

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
  boleto_emitido_via: string | null;
  boleto_situacao: string | null;
  boleto_pdf_path: string | null;
  nfse_status: string | null;
  nfse_erro_detalhe: string | null;
  nfse_pdf_path: string | null;
  nfse_ref: string | null;
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
  boletoEmitidoVia: string | null;
  boletoSituacao: string | null;
  boletoPdfPath: string | null;
  nfseStatus: string | null;
  nfseErroDetalhe: string | null;
  nfsePdfPath: string | null;
  nfseRef: string | null;
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
  // Alíquota do ISS (muda todo mês, recalculada em cima do faturamento) e
  // percentuais totais de tributos Federal/Municipal (fonte IBPT,
  // confirmados com o contador - segundo ele, "não mudam com tanta
  // frequência", mas deixados editáveis do mesmo jeito, por segurança).
  // Ficam guardados aqui pra não precisar caçar e-mail antigo toda vez
  // que for emitir uma NFS-e.
  const aliquotaIssQuery = useQuery({
    queryKey: ['configuracao-fiscal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracao_fiscal')
        .select('aliquota_iss, percentual_total_tributos_federais, percentual_total_tributos_municipais, atualizado_em')
        .eq('id', 1)
        .single();
      if (error) throw error;
      return data as {
        aliquota_iss: number | null;
        percentual_total_tributos_federais: number | null;
        percentual_total_tributos_municipais: number | null;
        atualizado_em: string | null;
      };
    },
  });
  const [editandoAliquota, setEditandoAliquota] = useState(false);
  const [novaAliquota, setNovaAliquota] = useState('');
  const [salvandoAliquota, setSalvandoAliquota] = useState(false);
  const [editandoTotalTributos, setEditandoTotalTributos] = useState(false);
  const [novoTotalFederal, setNovoTotalFederal] = useState('');
  const [novoTotalMunicipal, setNovoTotalMunicipal] = useState('');
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
    setNovoTotalFederal(String(aliquotaIssQuery.data?.percentual_total_tributos_federais ?? ''));
    setNovoTotalMunicipal(String(aliquotaIssQuery.data?.percentual_total_tributos_municipais ?? ''));
    setEditandoTotalTributos(true);
  }

  async function salvarTotalTributos() {
    const valorFederal = Number(novoTotalFederal);
    const valorMunicipal = Number(novoTotalMunicipal);
    if (!novoTotalFederal || Number.isNaN(valorFederal) || valorFederal <= 0) {
      alert('Informe um percentual federal válido.');
      return;
    }
    if (!novoTotalMunicipal || Number.isNaN(valorMunicipal) || valorMunicipal <= 0) {
      alert('Informe um percentual municipal válido.');
      return;
    }
    setSalvandoTotalTributos(true);
    try {
      const { error } = await supabase
        .from('configuracao_fiscal')
        .update({
          percentual_total_tributos_federais: valorFederal,
          percentual_total_tributos_municipais: valorMunicipal,
          atualizado_em: new Date().toISOString().slice(0, 10),
        })
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

  // Minimizar/restaurar preservando dados entre telas (mesmo mecanismo de
  // EntradaEquipamento.tsx) - o lançamento manual de NF envolve digitar
  // número de boleto/linha digitável à mão, dado caro de perder ao
  // navegar sem querer. O modal de prévia da NFS-e automática (Focus)
  // não usa esse mecanismo - é uma prévia derivada de uma chamada
  // externa, não dado digitado, então minimizar teria pouco valor.
  const { minimizar: minimizarRascunhoNF } = useRascunhoDeTela('faturamento-lancar-nota', {
    titulo: linhaSelecionada ? `Lançar nota fiscal - ${linhaSelecionada.numero}` : 'Lançar nota fiscal',
    obterEstado: () => ({
      linhaSelecionada,
      form,
      parcelado,
      parcelas,
      numParcelasAuto,
      primeiroVencimentoAuto,
      intervaloDiasAuto,
    }),
    aoRestaurar: (e) => {
      setLinhaSelecionada((e.linhaSelecionada as LinhaFaturamento | null) ?? null);
      setForm((e.form as typeof formVazio) ?? formVazio);
      setParcelado((e.parcelado as boolean) ?? false);
      setParcelas((e.parcelas as ParcelaForm[]) ?? []);
      setNumParcelasAuto((e.numParcelasAuto as string) ?? '2');
      setPrimeiroVencimentoAuto((e.primeiroVencimentoAuto as string) ?? '');
      setIntervaloDiasAuto((e.intervaloDiasAuto as string) ?? '30');
      setErro(null);
    },
  });
  function minimizarLancamentoNota() {
    minimizarRascunhoNF();
    setLinhaSelecionada(null);
  }
  const [salvando, setSalvando] = useState(false);
  const [emitindoBoletoSicoob, setEmitindoBoletoSicoob] = useState(false);
  // Parcelamento decidido na hora de EMITIR O BOLETO, separado do
  // "Pagamento parcelado?" de quando a NF é lançada pela primeira vez -
  // cobre o caso de já ter uma NF registrada (uma conta só) e só agora
  // decidir dividir a cobrança em N boletos.
  const [parcelarBoleto, setParcelarBoleto] = useState(false);
  const [enviandoEmailCompleto, setEnviandoEmailCompleto] = useState(false);
  const [emitindoNfseId, setEmitindoNfseId] = useState<string | null>(null);
  const [enviandoEmailOficialId, setEnviandoEmailOficialId] = useState<string | null>(null);
  const [cancelandoNfseId, setCancelandoNfseId] = useState<string | null>(null);
  const [carregandoPreviaId, setCarregandoPreviaId] = useState<string | null>(null);
  const [salvandoCadastroTomador, setSalvandoCadastroTomador] = useState(false);
  const [previaNfse, setPreviaNfse] = useState<{
    // 1 item no fluxo normal - 2+ quando é uma NF consolidada pra vários
    // orçamentos do mesmo cliente (seleção múltipla abaixo).
    linhas: LinhaFaturamento[];
    payload: Record<string, unknown>;
    resumoSomenteLeitura: {
      ambiente: 'homologacao' | 'producao';
      valorServico: number;
      // > 0 só pra clientes com faturamento diferido de peças (Grupo
      // Cortical) - valor que fica de fora dessa NFS-e e vira uma 2ª conta
      // sem NF, criada automaticamente ao confirmar (ver emitir-nfse).
      valorPecas: number;
      aliquotaIss: number | null;
      percentualTotalTributosFederais: number | null;
      percentualTotalTributosMunicipais: number | null;
      numeroOrcamentos: string[];
    };
  } | null>(null);
  // Seleção múltipla pra consolidar vários orçamentos "liberados" (sem NF
  // ainda, sem conta ainda) do MESMO cliente numa nota só.
  const [selecionadasFaturar, setSelecionadasFaturar] = useState<Set<string>>(new Set());
  const [parceladoConsolidado, setParceladoConsolidado] = useState(false);
  const [parcelasConsolidado, setParcelasConsolidado] = useState<
    { valor: string; vencimento: string; boletoNumero: string; boletoLinhaDigitavel: string }[]
  >([]);
  const [formNfse, setFormNfse] = useState<{
    razaoSocial: string;
    documento: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cep: string;
    cidade: string;
    uf: string;
    telefone: string;
    email: string;
    descricaoServico: string;
  } | null>(null);
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
          'id, numero_conta, orcamento_id, cliente_id, descricao, valor, status, nf_tipo, nf_numero, nf_serie, nf_chave_acesso, nf_data_emissao, boleto_numero, boleto_linha_digitavel, boleto_vencimento, boleto_emitido_via, boleto_situacao, boleto_pdf_path, nfse_status, nfse_erro_detalhe, nfse_pdf_path, nfse_ref, orcamentos(numero_orcamento, ordem_servico_id, ordens_servico(numero_os))',
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
      boletoEmitidoVia: c.boleto_emitido_via,
      boletoSituacao: c.boleto_situacao,
      boletoPdfPath: c.boleto_pdf_path,
      nfseStatus: c.nfse_status,
      nfseErroDetalhe: c.nfse_erro_detalhe,
      nfsePdfPath: c.nfse_pdf_path,
      nfseRef: c.nfse_ref,
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
          boletoEmitidoVia: null,
          boletoSituacao: null,
          boletoPdfPath: null,
          nfseStatus: null,
          nfseErroDetalhe: null,
          nfsePdfPath: null,
          nfseRef: null,
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
    setParcelarBoleto(false);
    setNumParcelasAuto('2');
    setPrimeiroVencimentoAuto('');
    setIntervaloDiasAuto('30');
    setErro(null);
  }

  // Emite o boleto de verdade via API da Sicoob (edge function
  // emitir-boleto, ação 'incluir') - só disponível quando a conta a
  // receber já existe (precisa de um contaId pra Sicoob associar o
  // boleto). Preenche os campos de boleto sozinho a partir do retorno,
  // sem precisar digitar linha digitável à mão.
  async function emitirBoletoSicoob() {
    if (!linhaSelecionada?.contaId) {
      setErro('Salve a nota fiscal primeiro (isso cria a conta a receber) antes de emitir o boleto pela Sicoob.');
      return;
    }
    setEmitindoBoletoSicoob(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-boleto', {
        body: { acao: 'incluir', contaId: linhaSelecionada.contaId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setForm((f) => ({
        ...f,
        boleto_numero: String(data.boletoNumero ?? ''),
        boleto_linha_digitavel: data.linhaDigitavel ?? '',
      }));
      // Atualiza a linha selecionada na hora, sem esperar reabrir o modal -
      // é o que decide se mostra "Emitido via Sicoob" ou o botão de novo.
      setLinhaSelecionada((l) =>
        l
          ? {
              ...l,
              boletoEmitidoVia: 'sicoob',
              boletoSituacao: 'Em Aberto',
              boletoPdfPath: data.pdfPath ?? null,
            }
          : l,
      );
      qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
    } catch (e) {
      setErro(await mensagemErroFuncao(e));
    } finally {
      setEmitindoBoletoSicoob(false);
    }
  }

  // Divide a conta atual (NF já lançada, 1 boleto) em N contas/boletos -
  // decisão tomada agora, na hora de emitir, não lá atrás no lançamento da
  // NF. Segue o mesmo padrão já usado em salvarNota() pro parcelamento no
  // lançamento (apaga a conta única, cria N no lugar, cada uma com sua
  // própria data_vencimento) - só que aqui cada parcela nova já emite seu
  // boleto na Sicoob em seguida, sequencialmente.
  async function emitirBoletosParcelados() {
    if (!linhaSelecionada?.contaId) return;
    const n = Number(numParcelasAuto);
    if (!n || n < 2) {
      setErro('Informe um número de parcelas válido (2 ou mais).');
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

    setEmitindoBoletoSicoob(true);
    setErro(null);
    try {
      const { error: erroRemover } = await supabase.from('contas_receber').delete().eq('id', linhaSelecionada.contaId);
      if (erroRemover) throw erroRemover;

      const contaIdsNovos: number[] = [];
      for (let i = 0; i < n; i++) {
        const valorCentavos = baseCentavos + (i === n - 1 ? restoCentavos : 0);
        const vencimento = new Date(`${primeiroVencimentoAuto}T00:00:00`);
        vencimento.setDate(vencimento.getDate() + intervalo * i);
        const numeroConta = await gerarNumeroSequencial('CR', 'contas_receber', 'numero_conta');
        const { data: novaConta, error } = await supabase
          .from('contas_receber')
          .insert({
            numero_conta: numeroConta,
            orcamento_id: linhaSelecionada.orcamentoId,
            cliente_id: linhaSelecionada.clienteId,
            descricao: `${linhaSelecionada.descricao} - Parcela ${i + 1}/${n}`,
            valor: valorCentavos / 100,
            data_vencimento: vencimento.toISOString().slice(0, 10),
            status: 'Em aberto',
            nf_tipo: form.nf_tipo,
            nf_numero: form.nf_numero,
            nf_serie: form.nf_serie || null,
            nf_chave_acesso: form.nf_chave_acesso ? form.nf_chave_acesso.replace(/\D/g, '') : null,
            nf_data_emissao: form.nf_data_emissao || null,
          })
          .select('id')
          .single();
        if (error) throw error;
        contaIdsNovos.push(novaConta.id);
      }

      // Emite o boleto de cada parcela na Sicoob, uma de cada vez (chamadas
      // em paralelo arriscariam número de conta/numeroParcela colidindo).
      for (const id of contaIdsNovos) {
        const { data, error } = await supabase.functions.invoke('emitir-boleto', {
          body: { acao: 'incluir', contaId: id },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }

      setLinhaSelecionada(null);
      qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
    } catch (e) {
      setErro(
        `${await mensagemErroFuncao(e)} (confira em Contas a Receber quais parcelas já ficaram com boleto emitido antes de tentar de novo)`,
      );
    } finally {
      setEmitindoBoletoSicoob(false);
    }
  }

  // Monta e envia (via Resend, function enviar-orcamento) um e-mail com o
  // PDF do Orçamento (já com preço final, direto do banco - não depende de
  // nenhum estado de edição em tela) + o(s) PDF(s) de boleto de TODAS as
  // contas que compartilham a mesma NF/orçamento (cobre o caso de boleto
  // parcelado, que gerou N contas). NÃO reanexa Registro de
  // Entrada/Ordem de Serviço - esses já foram enviados antes, na aprovação
  // do orçamento (ver OrcamentoFinanceiro.tsx) - reenviar de novo aqui
  // seria redundante.
  async function enviarEmailCompleto() {
    if (!linhaSelecionada?.orcamentoId) {
      setErro('Essa conta não está ligada a um orçamento - não dá pra montar o PDF do orçamento pra anexar.');
      return;
    }
    setEnviandoEmailCompleto(true);
    setErro(null);
    try {
      const { data: orc, error: erroOrc } = await supabase
        .from('orcamentos')
        .select(
          'numero_orcamento, valor_fixo_contrato, desconto, bonificacao, validade_proposta, condicoes_pagamento, observacoes_financeiro, ordem_servico_id, ordens_servico(numero_os, cliente_id, cliente_nome, optica_desc, optica_sn, eh_otica, cliente_final_id)',
        )
        .eq('id', linhaSelecionada.orcamentoId)
        .single();
      if (erroOrc || !orc) throw erroOrc ?? new Error('Orçamento não encontrado.');
      // deno-lint-ignore no-explicit-any
      const os = orc.ordens_servico as unknown as {
        numero_os: string;
        cliente_id: number;
        cliente_nome: string;
        optica_desc: string | null;
        optica_sn: string | null;
        eh_otica: boolean | null;
        cliente_final_id: number | null;
      } | null;

      const { data: itensOrc, error: erroItens } = await supabase
        .from('orcamento_itens')
        .select('preco_unitario, quantidade, observacao, descricao_servico, produtos_servicos(nome)')
        .eq('orcamento_id', linhaSelecionada.orcamentoId);
      if (erroItens) throw erroItens;

      const { data: cliente, error: erroCliente } = await supabase
        .from('clientes')
        .select('razao_social, nome_fantasia, cnpj, telefone, email, emails_adicionais, logradouro, numero_endereco, complemento, bairro, cidade, uf, cep')
        .eq('id', linhaSelecionada.clienteId!)
        .single();
      if (erroCliente || !cliente) throw erroCliente ?? new Error('Cliente não encontrado.');

      let clienteFinalNome: string | null = null;
      if (os?.cliente_final_id) {
        const { data: cf } = await supabase.from('clientes').select('razao_social').eq('id', os.cliente_final_id).maybeSingle();
        clienteFinalNome = cf?.razao_social ?? null;
      }

      const { data: entrada } = await supabase
        .from('entradas_equipamento')
        .select('nf_remessa_numero, nf_remessa_serie, numero_controle_cliente')
        .eq('ordem_servico_id', orc.ordem_servico_id)
        .maybeSingle();

      const enderecoCliente = [[cliente.logradouro, cliente.numero_endereco].filter(Boolean).join(', '), cliente.complemento, cliente.bairro, cliente.cep ? `CEP ${cliente.cep}` : null]
        .filter(Boolean)
        .join(' - ') || null;

      const subtotalItens = (itensOrc ?? []).reduce((s, it) => s + (it.preco_unitario ?? 0) * it.quantidade, 0);
      const subtotal = orc.valor_fixo_contrato ?? subtotalItens;
      const totalFinal = linhaSelecionada.valor;

      const dadosOrc: DadosOrcamentoPdf = {
        cnpj: cliente.cnpj,
        nomeFantasia: cliente.nome_fantasia,
        endereco: enderecoCliente,
        cidade: cliente.cidade,
        uf: cliente.uf,
        telefone: cliente.telefone,
        email: cliente.email,
        numeroOrcamento: orc.numero_orcamento,
        numeroOS: os?.numero_os ?? '-',
        clienteNome: os?.cliente_nome ?? cliente.razao_social,
        clienteFinalNome,
        equipamento: os?.optica_desc ?? '-',
        numeroSerie: os?.optica_sn ?? '',
        nfRemessaNumero: entrada?.nf_remessa_numero ?? null,
        nfRemessaSerie: entrada?.nf_remessa_serie ?? null,
        numeroControleCliente: entrada?.numero_controle_cliente ?? null,
        itens: (itensOrc ?? []).map((it) => ({
          nome: (it.produtos_servicos as unknown as { nome: string } | null)?.nome ?? it.descricao_servico ?? '-',
          quantidade: it.quantidade,
          precoUnit: it.preco_unitario ?? 0,
          observacao: it.observacao,
        })),
        subtotal,
        desconto: orc.desconto ?? 0,
        bonificacao: orc.bonificacao ?? false,
        total: totalFinal,
        validade: orc.validade_proposta ?? '',
        pagamento: orc.condicoes_pagamento ?? '',
        observacoes: orc.observacoes_financeiro ?? '',
        ehOtica: os?.eh_otica ?? false,
        garantiaResumo: GARANTIA_CVF.resumo,
        garantiaIntro: GARANTIA_CVF.intro,
        garantiaItens: GARANTIA_CVF.itens,
        clausulas: CLAUSULAS_GERAIS,
      };
      const anexos: AnexoBase64[] = [await gerarAnexoOrcamentoSozinho(dadosOrc)];

      // Todas as contas que compartilham a mesma NF+orçamento (cobre o
      // caso de boleto parcelado em N contas) - anexa o PDF de cada boleto
      // já emitido via Sicoob.
      const { data: contasIrmas } = await supabase
        .from('contas_receber')
        .select('numero_conta, boleto_pdf_path, boleto_numero')
        .eq('orcamento_id', linhaSelecionada.orcamentoId)
        .eq('nf_numero', form.nf_numero);
      for (const c of contasIrmas ?? []) {
        if (!c.boleto_pdf_path) continue;
        const url = await urlAssinadaDocumentoFinanceiro(c.boleto_pdf_path);
        if (!url) continue;
        const resp = await fetch(url);
        const blob = await resp.blob();
        anexos.push({ filename: `Boleto-${c.boleto_numero ?? c.numero_conta}.pdf`, content: await blobParaBase64(blob) });
      }

      const nfTexto = form.nf_numero
        ? `${form.nf_tipo ?? 'NF'} ${form.nf_numero}${form.nf_serie ? '/' + form.nf_serie : ''}`
        : 'a nota fiscal referente a este orçamento';
      const qtdBoletos = anexos.length - 1;
      const html = `<p>Prezado(a) cliente,</p>
        <p>Segue em anexo a documentação referente ao orçamento <strong>${orc.numero_orcamento}</strong> (OS ${os?.numero_os ?? '-'}), já faturado:</p>
        <ul>
          <li>Orçamento (com o valor final cobrado)</li>
          <li>Nota fiscal: ${nfTexto}</li>
          ${qtdBoletos > 0 ? `<li>${qtdBoletos > 1 ? `${qtdBoletos} boletos para pagamento` : 'Boleto para pagamento'}</li>` : ''}
        </ul>
        <p>Acompanhe tudo também pelo portal do cliente: <a href="${PORTAL_CLIENTE_URL}">${PORTAL_CLIENTE_URL}</a></p>
        <p>Permanecemos à disposição para quaisquer esclarecimentos.</p>
        <p>Atenciosamente,<br/><strong>${EMPRESA.razaoSocial}</strong></p>`;

      const extras = (cliente.emails_adicionais ?? '')
        .split(',')
        .map((e: string) => e.trim())
        .filter(Boolean);
      const destinatarios = [cliente.email, ...extras].filter((e): e is string => !!e);
      if (destinatarios.length === 0) {
        setErro('Este cliente não tem e-mail cadastrado.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('enviar-orcamento', {
        body: {
          to: destinatarios,
          subject: `Q-CVF Medical - Orçamento ${orc.numero_orcamento} faturado (${formatarMoeda(totalFinal)})`,
          html,
          anexos,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao enviar o e-mail.');

      alert(`E-mail enviado para ${destinatarios.join(', ')} com ${anexos.length} anexo(s).`);
    } catch (e) {
      setErro(await mensagemErroFuncao(e));
    } finally {
      setEnviandoEmailCompleto(false);
    }
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

  // Antes de transmitir de fato pro SEFAZ, busca a prévia dos dados da DPS
  // (mesmo payload que seria enviado, mas sem transmitir) pro setor de
  // faturamento conferir num modal - só chama a emissão de verdade depois
  // de confirmado ali.
  // Confere se todas as linhas marcadas são do mesmo cliente - uma NFS-e
  // só tem um tomador, não dá pra consolidar orçamentos de clientes
  // diferentes. Mesmo padrão de clienteComumDas() já usado em Entrega.tsx.
  function clienteComumDasLinhas(linhas: LinhaFaturamento[]): number | null {
    const clienteIds = new Set(linhas.map((l) => l.clienteId).filter((id): id is number => id != null));
    return clienteIds.size === 1 ? [...clienteIds][0] : null;
  }

  function alternarSelecaoFaturar(chave: string) {
    setSelecionadasFaturar((s) => {
      const nova = new Set(s);
      if (nova.has(chave)) nova.delete(chave);
      else nova.add(chave);
      return nova;
    });
  }

  async function abrirPreviaNfse(linhas: LinhaFaturamento[]) {
    if (linhas.length === 0) return;
    if (linhas.length === 1 && !linhas[0].contaId && !linhas[0].orcamentoId) return;
    // Consolidando vários: só faz sentido pra orçamentos "liberados" que
    // ainda não têm conta nenhuma (contaId == null) - já teria uma NF/
    // conta própria se já existisse.
    if (linhas.length > 1 && linhas.some((l) => l.contaId != null || !l.orcamentoId)) {
      setErro('Só é possível consolidar orçamentos ainda sem conta/NF lançada.');
      return;
    }
    const chaveCarregando = linhas.length === 1 ? linhas[0].chave : 'consolidado';
    setCarregandoPreviaId(chaveCarregando);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfse', {
        body:
          linhas.length === 1
            ? {
                ...(linhas[0].contaId ? { contaId: linhas[0].contaId } : { orcamentoId: linhas[0].orcamentoId }),
                acao: 'previsualizar',
              }
            : { orcamentoIds: linhas.map((l) => l.orcamentoId!), acao: 'previsualizar' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao gerar prévia da NFS-e.');
      const r = data.resumo;
      setPreviaNfse({
        linhas,
        payload: data.payload,
        resumoSomenteLeitura: {
          ambiente: r.ambiente,
          valorServico: r.valorServico,
          valorPecas: r.valorPecas ?? 0,
          aliquotaIss: r.aliquotaIss,
          percentualTotalTributosFederais: r.percentualTotalTributosFederais,
          percentualTotalTributosMunicipais: r.percentualTotalTributosMunicipais,
          numeroOrcamentos: r.numeroOrcamentos ?? [],
        },
      });
      setFormNfse({
        razaoSocial: r.razaoSocialTomador ?? '',
        documento: r.documentoTomador ?? '',
        logradouro: r.logradouroTomador ?? '',
        numero: r.numeroEnderecoTomador ?? '',
        complemento: r.complementoTomador ?? '',
        bairro: r.bairroTomador ?? '',
        cep: r.cepTomador ?? '',
        cidade: r.cidadeTomador ?? '',
        uf: r.ufTomador ?? '',
        telefone: r.telefoneTomador ?? '',
        email: r.emailTomador ?? '',
        descricaoServico: r.descricaoServico ?? '',
      });
      setParceladoConsolidado(false);
      setParcelasConsolidado(
        linhas.length > 1
          ? [{ valor: String(r.valorServico), vencimento: '', boletoNumero: '', boletoLinhaDigitavel: '' }]
          : [],
      );
    } catch (e) {
      setErro(await mensagemErroFuncao(e));
    } finally {
      setCarregandoPreviaId(null);
    }
  }

  function fecharPreviaNfse() {
    setPreviaNfse(null);
    setFormNfse(null);
  }

  // Grava os dados do tomador editados na tela de conferência de volta no
  // cadastro do cliente - assim a correção (ex.: endereço que faltava) vale
  // pras próximas notas também, não só pra essa.
  async function salvarDadosTomador() {
    if (!previaNfse?.linhas[0]?.clienteId || !formNfse) return;
    setSalvandoCadastroTomador(true);
    setErro(null);
    try {
      const { error } = await supabase
        .from('clientes')
        .update({
          razao_social: formNfse.razaoSocial,
          cnpj: formNfse.documento,
          logradouro: formNfse.logradouro,
          numero_endereco: formNfse.numero,
          complemento: formNfse.complemento,
          bairro: formNfse.bairro,
          cep: formNfse.cep,
          cidade: formNfse.cidade,
          uf: formNfse.uf,
          telefone: formNfse.telefone,
          email: formNfse.email,
        })
        .eq('id', previaNfse.linhas[0].clienteId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['clientes-opcoes-faturamento'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvandoCadastroTomador(false);
    }
  }

  function visualizarPreviaDanfse() {
    if (!previaNfse || !formNfse) return;
    abrirPreviaDanfse({
      ambiente: previaNfse.resumoSomenteLeitura.ambiente,
      serieDps: String(previaNfse.payload.serie_dps),
      numeroDps: String(previaNfse.payload.numero_dps),
      dataEmissao: String(previaNfse.payload.data_emissao),
      razaoSocialTomador: formNfse.razaoSocial,
      documentoTomador: formNfse.documento,
      logradouroTomador: formNfse.logradouro,
      numeroTomador: formNfse.numero,
      complementoTomador: formNfse.complemento,
      bairroTomador: formNfse.bairro,
      cepTomador: formNfse.cep,
      cidadeTomador: formNfse.cidade,
      ufTomador: formNfse.uf,
      telefoneTomador: formNfse.telefone,
      emailTomador: formNfse.email,
      descricaoServico: formNfse.descricaoServico,
      valorServico: previaNfse.resumoSomenteLeitura.valorServico,
      aliquotaIss: previaNfse.resumoSomenteLeitura.aliquotaIss,
      codigoTributacaoNacionalIss: String(previaNfse.payload.codigo_tributacao_nacional_iss),
      codigoNbs: String(previaNfse.payload.codigo_nbs),
      inscricaoMunicipalPrestador: String(previaNfse.payload.inscricao_municipal_prestador ?? ''),
      codigoOpcaoSimplesNacional: Number(previaNfse.payload.codigo_opcao_simples_nacional),
      regimeEspecialTributacao: Number(previaNfse.payload.regime_especial_tributacao),
      codigoIndicadorOperacao: String(previaNfse.payload.codigo_indicador_operacao),
      ibsCbsSituacaoTributaria: String(previaNfse.payload.ibs_cbs_situacao_tributaria),
      ibsCbsClassificacaoTributaria: String(previaNfse.payload.ibs_cbs_classificacao_tributaria),
    });
  }

  // Pede pra própria Focus NFe reenviar a nota (com o PDF OFICIAL, gerado
  // por eles/pela Sefin Nacional) direto pro e-mail do cliente - descoberto
  // na documentação deles (POST /v2/nfsen/{ref}/email) depois que o link
  // direto do PDF ("url_danfse", hospedado num bucket S3 da Focus) deu
  // "Access Denied" no primeiro teste real. Evita ter que gerar uma versão
  // caseira do DANFSe (tentado antes e corretamente rejeitado pelo
  // usuário - não é o documento oficial, não deve ir pro cliente).
  async function reenviarEmailOficial(l: LinhaFaturamento) {
    if (!l.contaId) return;
    const emailPadrao = clientesQuery.data?.find((c) => c.id === l.clienteId)?.email ?? '';
    const digitado = window.prompt(
      'Enviar a NFS-e oficial (PDF gerado pela Focus NFe/prefeitura) para qual e-mail? Separe vários com vírgula.',
      emailPadrao,
    );
    if (!digitado) return;
    const emails = digitado
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    setEnviandoEmailOficialId(l.chave);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfse', {
        body: { contaId: l.contaId, acao: 'reenviar_email', emails },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao reenviar e-mail.');
      window.alert(`Pedido de reenvio feito à Focus NFe. Pode levar alguns minutos para chegar em: ${emails.join(', ')}`);
    } catch (e) {
      setErro(await mensagemErroFuncao(e));
    } finally {
      setEnviandoEmailOficialId(null);
    }
  }

  // Cancela de verdade na Focus NFe/Sefin Nacional (DELETE /v2/nfsen/{ref}) -
  // diferente de "Remover NF" (mais abaixo), que só apaga os campos AQUI no
  // nosso banco, sem avisar a prefeitura. Isso é IRREVERSÍVEL e só funciona
  // dentro do prazo que a prefeitura permite - passado esse prazo, a Focus
  // recusa e o erro real aparece na tela (via mensagemErroFuncao).
  async function cancelarNfseOficial(l: LinhaFaturamento) {
    if (!l.contaId || !l.nfseRef) return;
    const justificativa = window.prompt(
      `Cancelar a NFS-e ${l.nf_numero} de verdade junto à prefeitura? Essa ação é IRREVERSÍVEL.\n\nJustificativa (opcional, mas pode ser exigida pela prefeitura):`,
      '',
    );
    if (justificativa === null) return; // cancelou o prompt
    pedirConfirmacao(
      async () => {
        setCancelandoNfseId(l.chave);
        setErro(null);
        try {
          const { data, error } = await supabase.functions.invoke('emitir-nfse', {
            body: { contaId: l.contaId, acao: 'cancelar', justificativa: justificativa || undefined },
          });
          if (error) throw error;
          if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao cancelar NFS-e.');
          qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
        } catch (e) {
          setErro(await mensagemErroFuncao(e));
        } finally {
          setCancelandoNfseId(null);
        }
      },
      {
        titulo: 'Cancelar NFS-e',
        mensagem: `Confirma o cancelamento definitivo da NFS-e nº ${l.nf_numero} junto à prefeitura? Não tem como desfazer.`,
      },
    );
  }

  async function confirmarEmissaoNfse() {
    if (!previaNfse || !formNfse) return;
    let parcelasParaEnviar: { valor: number; vencimento: string; boletoNumero?: string; boletoLinhaDigitavel?: string }[] | undefined;
    if (previaNfse.linhas.length > 1) {
      if (parceladoConsolidado) {
        if (parcelasConsolidado.some((p) => !p.valor || !p.vencimento)) {
          setErro('Preencha valor e vencimento de todas as parcelas.');
          return;
        }
        const somaParcelas = parcelasConsolidado.reduce((s, p) => s + Number(p.valor), 0);
        if (Math.abs(somaParcelas - previaNfse.resumoSomenteLeitura.valorServico) > 0.01) {
          setErro(
            `A soma das parcelas (R$ ${somaParcelas.toFixed(2)}) precisa bater com o valor total (R$ ${previaNfse.resumoSomenteLeitura.valorServico.toFixed(2)}).`,
          );
          return;
        }
        parcelasParaEnviar = parcelasConsolidado.map((p) => ({
          valor: Number(p.valor),
          vencimento: p.vencimento,
          boletoNumero: p.boletoNumero || undefined,
          boletoLinhaDigitavel: p.boletoLinhaDigitavel || undefined,
        }));
      } else {
        parcelasParaEnviar = undefined; // 1 parcela só, com o total - a function usa vencimento padrão de 30 dias
      }
    }
    const sucesso = await emitirNFSe(previaNfse.linhas, parcelasParaEnviar, {
      razao_social_tomador: formNfse.razaoSocial,
      documento_tomador: formNfse.documento,
      logradouro_tomador: formNfse.logradouro,
      numero_tomador: formNfse.numero,
      complemento_tomador: formNfse.complemento,
      bairro_tomador: formNfse.bairro,
      cep_tomador: formNfse.cep,
      cidade_tomador: formNfse.cidade,
      uf_tomador: formNfse.uf,
      telefone_tomador: formNfse.telefone,
      email_tomador: formNfse.email,
      descricao_servico: formNfse.descricaoServico,
    });
    if (sucesso) {
      fecharPreviaNfse();
      setSelecionadasFaturar(new Set());
    }
  }

  // Emissão automática de NFS-e pela Focus NFe - alternativa ao "Lançar
  // NF" manual (que continua existindo pra quando for preciso lançar uma
  // nota emitida por fora, ex.: Focus NFe fora do ar). Enquanto
  // "processando", o técnico usa "Verificar status" pra puxar o resultado
  // final (autorizada/erro) da Focus NFe.
  async function emitirNFSe(
    linhas: LinhaFaturamento[],
    parcelas?: { valor: number; vencimento: string; boletoNumero?: string; boletoLinhaDigitavel?: string }[],
    overrides?: {
      razao_social_tomador: string;
      documento_tomador: string;
      logradouro_tomador: string;
      numero_tomador: string;
      complemento_tomador: string;
      bairro_tomador: string;
      cep_tomador: string;
      cidade_tomador: string;
      uf_tomador: string;
      telefone_tomador: string;
      email_tomador: string;
      descricao_servico: string;
    },
  ): Promise<boolean> {
    const l = linhas[0];
    if (linhas.length === 1 && !l.contaId && !l.orcamentoId) return false;
    setEmitindoNfseId(linhas.length === 1 ? l.chave : 'consolidado');
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfse', {
        body: {
          ...(linhas.length === 1
            ? l.contaId
              ? { contaId: l.contaId }
              : { orcamentoId: l.orcamentoId }
            : { orcamentoIds: linhas.map((x) => x.orcamentoId!), ...(parcelas ? { parcelas } : {}) }),
          acao: 'emitir',
          ...(overrides ? { overrides } : {}),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao emitir NFS-e.');
      // Quando a conta ainda não existia (orçamento "Liberado" direto), a
      // function acabou de criá-la agora - sem invalidar essa segunda
      // query, a linha "pseudo" (baseada no orçamento) continuaria
      // aparecendo do lado da nova conta real, duplicada.
      qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
      qc.invalidateQueries({ queryKey: ['faturamento-orcamentos-aprovados'] });
      return true;
    } catch (e) {
      setErro(await mensagemErroFuncao(e));
      return false;
    } finally {
      setEmitindoNfseId(null);
    }
  }

  async function consultarStatusNFSe(l: LinhaFaturamento) {
    if (!l.contaId) return;
    setEmitindoNfseId(l.chave);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-nfse', {
        body: { contaId: l.contaId, acao: 'consultar' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao consultar status.');
      qc.invalidateQueries({ queryKey: ['faturamento-contas-receber'] });
    } catch (e) {
      setErro(await mensagemErroFuncao(e));
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
          <span style={{ color: 'var(--ink-400)' }}>% Total de Tributos - Federal/Municipal (IBPT):</span>
          {editandoTotalTributos ? (
            <>
              <input
                type="number"
                step="0.01"
                value={novoTotalFederal}
                onChange={(e) => setNovoTotalFederal(e.target.value)}
                placeholder="Federal"
                style={{ width: 80 }}
                autoFocus
              />
              <span>% /</span>
              <input
                type="number"
                step="0.01"
                value={novoTotalMunicipal}
                onChange={(e) => setNovoTotalMunicipal(e.target.value)}
                placeholder="Municipal"
                style={{ width: 80 }}
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
                {aliquotaIssQuery.data?.percentual_total_tributos_federais != null
                  ? `${Number(aliquotaIssQuery.data.percentual_total_tributos_federais).toFixed(2)}%`
                  : '-'}{' '}
                /{' '}
                {aliquotaIssQuery.data?.percentual_total_tributos_municipais != null
                  ? `${Number(aliquotaIssQuery.data.percentual_total_tributos_municipais).toFixed(2)}%`
                  : '-'}
              </strong>
              <button className="botao-secundario botao-pequeno" onClick={abrirEdicaoTotalTributos}>
                Atualizar
              </button>
            </>
          )}
        </div>
      </div>

      {erro && !linhaSelecionada && !previaNfse && <p className="erro-login">{erro}</p>}

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

      {selecionadasFaturar.size > 0 &&
        (() => {
          const linhasSelecionadas = linhasParaFaturar.filter((l) => selecionadasFaturar.has(l.chave));
          const clienteConsolidado = clienteComumDasLinhas(linhasSelecionadas);
          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'var(--paper-50)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <span>{linhasSelecionadas.length} orçamento(s) selecionado(s) pra consolidar numa NF só.</span>
              {clienteConsolidado == null && (
                <span className="erro-login" style={{ margin: 0 }}>
                  Os orçamentos marcados são de clientes diferentes - selecione só orçamentos do mesmo cliente.
                </span>
              )}
              <button className="botao-secundario botao-pequeno" onClick={() => setSelecionadasFaturar(new Set())}>
                Limpar seleção
              </button>
              <button
                className="botao-primario botao-pequeno"
                disabled={linhasSelecionadas.length < 2 || clienteConsolidado == null}
                onClick={() => abrirPreviaNfse(linhasSelecionadas)}
              >
                Lançar NF consolidada ({linhasSelecionadas.length})
              </button>
            </div>
          );
        })()}

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
            Já foi entregue fora do sistema (atalho, uso raro)
          </strong>
          <p style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 8 }}>
            Só pra orçamentos aprovados cuja entrega ao cliente e a NF JÁ ACONTECERAM na vida real, fora do sistema
            (ex.: caso antigo, lançado com atraso). Marca a OS direto como "Entregue", sem passar pela tela de
            Entrega ao cliente - por isso <strong>não gera código de rastreio nem dispara e-mail ao cliente</strong>.
            Se o equipamento ainda vai ser despachado/retirado normalmente, NÃO use isto - espere a OS chegar em
            "Pronto para entrega" e registre pela tela Entrega ao cliente, que é o caminho que envia o rastreio.
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
              {pulandoEtapa ? 'Processando...' : 'Marcar como já entregue'}
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
            <th></th>
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
            <th></th>
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
                {l.contaId == null && l.orcamentoId != null && !l.nf_numero && (
                  <input
                    type="checkbox"
                    title="Marcar pra consolidar numa NF só com outros orçamentos do mesmo cliente"
                    checked={selecionadasFaturar.has(l.chave)}
                    onChange={() => alternarSelecaoFaturar(l.chave)}
                  />
                )}
              </td>
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
                {l.nfseStatus === 'cancelada' ? (
                  <>
                    <Badge tono="danger">NFS-e cancelada</Badge>{' '}
                    <span className="mono" style={{ fontSize: 12, textDecoration: 'line-through' }}>
                      {l.nf_tipo} {l.nf_numero}
                      {l.nf_serie ? `/${l.nf_serie}` : ''}
                    </span>
                  </>
                ) : l.nf_numero ? (
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
                  <span title={l.nfseErroDetalhe ?? 'Ainda sem retorno da Focus NFe/prefeitura - clique em "Verificar status" de novo em instantes.'}>
                    {' '}
                    <Badge tono="copper">NFS-e processando</Badge>
                  </span>
                )}
                {!l.nf_numero && l.nfseStatus === 'erro' && (
                  <span title={l.nfseErroDetalhe ?? undefined}>
                    {' '}
                    <Badge tono="danger">Erro na NFS-e</Badge>
                  </span>
                )}
              </td>
              <td className="acoes-tabela">
                {(l.contaId != null || liberada(l.statusOS)) && !l.nf_numero && (!l.nfseStatus || l.nfseStatus === 'erro') && (
                  <button
                    className="botao-secundario"
                    onClick={() => abrirPreviaNfse([l])}
                    disabled={carregandoPreviaId === l.chave || emitindoNfseId === l.chave}
                    title={l.nfseErroDetalhe ?? undefined}
                  >
                    {carregandoPreviaId === l.chave ? 'Carregando...' : 'Emitir NFS-e'}
                  </button>
                )}
                {l.contaId != null && !l.nf_numero && l.nfseStatus === 'processando' && (
                  <button
                    className="botao-secundario"
                    onClick={() => consultarStatusNFSe(l)}
                    disabled={emitindoNfseId === l.chave}
                  >
                    {emitindoNfseId === l.chave ? 'Verificando...' : 'Verificar status'}
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
                {l.nfsePdfPath && (
                  <button
                    className="botao-secundario"
                    onClick={() => window.open(l.nfsePdfPath!, '_blank')}
                    title="PDF oficial hospedado pela Focus NFe - às vezes fica temporariamente indisponível (erro do lado deles, não nosso)"
                  >
                    Ver DANFSe oficial
                  </button>
                )}
                {l.nf_numero && l.nf_tipo === 'NFS-e' && l.contaId != null && (
                  <button
                    className="botao-secundario"
                    onClick={() => reenviarEmailOficial(l)}
                    disabled={enviandoEmailOficialId === l.chave}
                    title="Pede pra própria Focus NFe reenviar a NFS-e (com o PDF oficial, gerado por eles) direto pro e-mail do cliente - não depende de anexar nada manualmente"
                  >
                    {enviandoEmailOficialId === l.chave ? 'Enviando...' : 'Reenviar NF oficial por e-mail'}
                  </button>
                )}
                {l.nf_numero && l.nfseRef && l.nfseStatus !== 'cancelada' && (
                  <button
                    className="botao-secundario perigo"
                    onClick={() => cancelarNfseOficial(l)}
                    disabled={cancelandoNfseId === l.chave}
                    title="Cancela de verdade junto à prefeitura (Focus NFe) - irreversível, só funciona dentro do prazo permitido"
                  >
                    {cancelandoNfseId === l.chave ? 'Cancelando...' : 'Cancelar NF'}
                  </button>
                )}
                {l.nf_numero && l.contaId && !l.nfseRef && (
                  <button
                    className="botao-secundario perigo"
                    onClick={() => removerNota(l)}
                    title="Apaga só os dados aqui do nosso sistema - use quando a NF foi lançada manualmente (fora do nosso sistema) e precisa corrigir um registro local errado"
                  >
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
          aoMinimizar={minimizarLancamentoNota}
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
                {linhaSelecionada.boletoEmitidoVia === 'sicoob' ? (
                  <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                    Emitido via Sicoob{linhaSelecionada.boletoSituacao ? ` - ${linhaSelecionada.boletoSituacao}` : ''}.
                    {linhaSelecionada.boletoPdfPath && (
                      <>
                        {' '}
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-500, #2563eb)', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}
                          onClick={async () => {
                            const url = await urlAssinadaDocumentoFinanceiro(linhaSelecionada.boletoPdfPath!);
                            if (url) window.open(url, '_blank');
                            else setErro('Não foi possível abrir o PDF do boleto.');
                          }}
                        >
                          Ver PDF do boleto
                        </button>
                      </>
                    )}
                  </p>
                ) : null}
                {linhaSelecionada.contaId && linhaSelecionada.orcamentoId && (
                  <button
                    type="button"
                    className="botao-secundario botao-pequeno"
                    onClick={enviarEmailCompleto}
                    disabled={enviandoEmailCompleto}
                    title="Envia por e-mail o PDF do orçamento + boleto(s) já emitido(s) - a NF é só mencionada no texto"
                    style={{ marginBottom: 8 }}
                  >
                    {enviandoEmailCompleto ? 'Enviando...' : 'Enviar e-mail (Orçamento + NF + Boleto)'}
                  </button>
                )}
                {linhaSelecionada.boletoEmitidoVia !== 'sicoob' && (
                  linhaSelecionada.contaId && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <input
                          type="checkbox"
                          id="parcelarBoleto"
                          checked={parcelarBoleto}
                          onChange={(e) => setParcelarBoleto(e.target.checked)}
                          style={{ width: 'auto' }}
                        />
                        <label htmlFor="parcelarBoleto" style={{ marginBottom: 0 }}>
                          Dividir este boleto em parcelas?
                        </label>
                      </div>
                      {parcelarBoleto ? (
                        <>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div className="campo-form" style={{ flex: 1 }}>
                              <label>Nº de parcelas</label>
                              <input
                                type="number"
                                min={2}
                                value={numParcelasAuto}
                                onChange={(e) => setNumParcelasAuto(e.target.value)}
                              />
                            </div>
                            <div className="campo-form" style={{ flex: 1 }}>
                              <label>Vencimento da 1ª</label>
                              <input
                                type="date"
                                value={primeiroVencimentoAuto}
                                onChange={(e) => setPrimeiroVencimentoAuto(e.target.value)}
                              />
                            </div>
                            <div className="campo-form" style={{ flex: 1 }}>
                              <label>Intervalo entre parcelas (dias)</label>
                              <input
                                type="number"
                                value={intervaloDiasAuto}
                                onChange={(e) => setIntervaloDiasAuto(e.target.value)}
                              />
                            </div>
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: -4 }}>
                            Ex.: 2 parcelas com intervalo 28 = vencimentos "28 / 56 dias". A conta atual (1 boleto)
                            será substituída por {numParcelasAuto || 'N'} contas/boletos, cada uma já emitida na Sicoob.
                          </p>
                          <button
                            type="button"
                            className="botao-primario botao-pequeno"
                            onClick={emitirBoletosParcelados}
                            disabled={emitindoBoletoSicoob}
                            style={{ marginBottom: 8 }}
                          >
                            {emitindoBoletoSicoob ? 'Emitindo...' : `Emitir ${numParcelasAuto || 'N'} boletos via Sicoob`}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="botao-secundario botao-pequeno"
                          onClick={emitirBoletoSicoob}
                          disabled={emitindoBoletoSicoob}
                          title="Usa o vencimento já definido na conta a receber (o campo abaixo, se preenchido, ou o vencimento padrão da conta)"
                          style={{ marginBottom: 8 }}
                        >
                          {emitindoBoletoSicoob ? 'Emitindo...' : 'Emitir boleto via Sicoob'}
                        </button>
                      )}
                    </>
                  )
                )}
                {!parcelarBoleto && (
                  <>
                    <div className="campo-form">
                      <label>Número do boleto</label>
                      <input
                        type="text"
                        value={form.boleto_numero}
                        readOnly={linhaSelecionada.boletoEmitidoVia === 'sicoob'}
                        onChange={(e) => setForm((f) => ({ ...f, boleto_numero: e.target.value }))}
                      />
                    </div>
                    <div className="campo-form">
                      <label>Linha digitável</label>
                      <input
                        type="text"
                        value={form.boleto_linha_digitavel}
                        readOnly={linhaSelecionada.boletoEmitidoVia === 'sicoob'}
                        onChange={(e) => setForm((f) => ({ ...f, boleto_linha_digitavel: e.target.value }))}
                      />
                    </div>
                    <div className="campo-form">
                      <label>Vencimento do boleto</label>
                      <input
                        type="date"
                        value={form.boleto_vencimento}
                        readOnly={linhaSelecionada.boletoEmitidoVia === 'sicoob'}
                        onChange={(e) => setForm((f) => ({ ...f, boleto_vencimento: e.target.value }))}
                      />
                    </div>
                  </>
                )}
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
      {previaNfse && formNfse && (
        <ModalJanela
          titulo={
            previaNfse.linhas.length > 1
              ? `Emissão de NFS-e consolidada - ${previaNfse.linhas.length} orçamentos`
              : `Emissão de NFS-e - ${previaNfse.linhas[0].numero}`
          }
          aoFechar={fecharPreviaNfse}
          larguraMax={640}
        >
          <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
            Confira e corrija o que precisar antes de transmitir. Depois de "Confirmar e transmitir", a nota vai
            direto pro SEFAZ via Focus NFe - não dá pra editar depois de transmitida.
          </p>

          <div
            style={{
              display: 'inline-block',
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 6,
              marginBottom: 8,
              color: '#fff',
              background:
                previaNfse.resumoSomenteLeitura.ambiente === 'producao' ? 'var(--red-600, #c0392b)' : '#8a6d00',
            }}
          >
            {previaNfse.resumoSomenteLeitura.ambiente === 'producao'
              ? 'AMBIENTE: PRODUÇÃO - nota fiscal real, vale para a Receita/prefeitura'
              : 'AMBIENTE: HOMOLOGAÇÃO - nota de teste, não tem validade fiscal'}
          </div>

          {previaNfse.linhas.length > 1 && (
            <p style={{ fontSize: 13 }}>
              <strong>Orçamentos incluídos:</strong> {previaNfse.resumoSomenteLeitura.numeroOrcamentos.join(', ')}
            </p>
          )}

          <h2 style={{ fontSize: 13, marginTop: 12 }}>Prestador (CVF Medical)</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>CNPJ</label>
              <input type="text" value="46.948.692/0001-03" disabled />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Inscrição municipal</label>
              <input type="text" value={String(previaNfse.payload.inscricao_municipal_prestador ?? '')} disabled />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Município de emissão</label>
              <input type="text" value="Ribeirão Preto/SP" disabled />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Regime tributário</label>
              <input
                type="text"
                value={
                  previaNfse.payload.codigo_opcao_simples_nacional === 3
                    ? 'Simples Nacional - Optante (ME/EPP)'
                    : `Código ${previaNfse.payload.codigo_opcao_simples_nacional}`
                }
                disabled
              />
            </div>
          </div>

          <h2 style={{ fontSize: 13, marginTop: 16 }}>Tomador (cliente)</h2>
          <div className="campo-form">
            <label>Razão social</label>
            <input
              type="text"
              value={formNfse.razaoSocial}
              onChange={(e) => setFormNfse((f) => (f ? { ...f, razaoSocial: e.target.value } : f))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>CNPJ/CPF</label>
              <input
                type="text"
                value={formNfse.documento}
                onChange={(e) => setFormNfse((f) => (f ? { ...f, documento: e.target.value } : f))}
              />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Telefone</label>
              <input
                type="text"
                value={formNfse.telefone}
                onChange={(e) => setFormNfse((f) => (f ? { ...f, telefone: e.target.value } : f))}
              />
            </div>
          </div>
          <div className="campo-form">
            <label>E-mail</label>
            <input
              type="text"
              value={formNfse.email}
              onChange={(e) => setFormNfse((f) => (f ? { ...f, email: e.target.value } : f))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 2 }}>
              <label>Logradouro</label>
              <input
                type="text"
                value={formNfse.logradouro}
                onChange={(e) => setFormNfse((f) => (f ? { ...f, logradouro: e.target.value } : f))}
              />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Número</label>
              <input
                type="text"
                value={formNfse.numero}
                onChange={(e) => setFormNfse((f) => (f ? { ...f, numero: e.target.value } : f))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Complemento</label>
              <input
                type="text"
                value={formNfse.complemento}
                onChange={(e) => setFormNfse((f) => (f ? { ...f, complemento: e.target.value } : f))}
              />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Bairro</label>
              <input
                type="text"
                value={formNfse.bairro}
                onChange={(e) => setFormNfse((f) => (f ? { ...f, bairro: e.target.value } : f))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>CEP</label>
              <input
                type="text"
                value={formNfse.cep}
                onChange={(e) => setFormNfse((f) => (f ? { ...f, cep: e.target.value } : f))}
              />
            </div>
            <div className="campo-form" style={{ flex: 2 }}>
              <label>Cidade</label>
              <input
                type="text"
                value={formNfse.cidade}
                onChange={(e) => setFormNfse((f) => (f ? { ...f, cidade: e.target.value } : f))}
              />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>UF</label>
              <input
                type="text"
                maxLength={2}
                value={formNfse.uf}
                onChange={(e) => setFormNfse((f) => (f ? { ...f, uf: e.target.value.toUpperCase() } : f))}
              />
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: -4, marginBottom: 8 }}>
            "Salvar no cadastro" grava esses dados do tomador no cliente, pra não precisar corrigir de novo na
            próxima nota.
          </p>

          <h2 style={{ fontSize: 13, marginTop: 16 }}>Serviço</h2>
          <div className="campo-form">
            <label>Descrição</label>
            <input
              type="text"
              value={formNfse.descricaoServico}
              onChange={(e) => setFormNfse((f) => (f ? { ...f, descricaoServico: e.target.value } : f))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Valor do serviço</label>
              <input type="text" value={`R$ ${Number(previaNfse.resumoSomenteLeitura.valorServico).toFixed(2)}`} disabled />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Código NBS</label>
              <input type="text" value={String(previaNfse.payload.codigo_nbs)} disabled />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Cód. tributação (ISS)</label>
              <input type="text" value={String(previaNfse.payload.codigo_tributacao_nacional_iss)} disabled />
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: -4 }}>
            Pra mudar o valor, edite a conta em "Lançar NF"/orçamento antes de emitir a NFS-e.
          </p>
          {previaNfse.resumoSomenteLeitura.valorPecas > 0.01 && (
            <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: -4 }}>
              Cliente com faturamento diferido de peças: R${' '}
              {previaNfse.resumoSomenteLeitura.valorPecas.toFixed(2)} de peças ficam de fora dessa NFS-e e viram uma
              conta separada (sem NF), vencendo no 5º dia útil do mês seguinte.
            </p>
          )}

          <h2 style={{ fontSize: 13, marginTop: 16 }}>Tributação</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Alíquota ISS</label>
              <input
                type="text"
                value={
                  previaNfse.resumoSomenteLeitura.aliquotaIss != null
                    ? `${previaNfse.resumoSomenteLeitura.aliquotaIss.toFixed(2)}%`
                    : 'Não informada'
                }
                disabled
              />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>% Trib. federais (IBPT)</label>
              <input
                type="text"
                value={
                  previaNfse.resumoSomenteLeitura.percentualTotalTributosFederais != null
                    ? `${previaNfse.resumoSomenteLeitura.percentualTotalTributosFederais.toFixed(2)}%`
                    : 'Não informado'
                }
                disabled
              />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>% Trib. municipais (IBPT)</label>
              <input
                type="text"
                value={
                  previaNfse.resumoSomenteLeitura.percentualTotalTributosMunicipais != null
                    ? `${previaNfse.resumoSomenteLeitura.percentualTotalTributosMunicipais.toFixed(2)}%`
                    : 'Não informado'
                }
                disabled
              />
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: -4 }}>
            Alíquota/percentuais são definidos em Financeiro → Faturamento (acima da tabela), não aqui.
          </p>

          <h2 style={{ fontSize: 13, marginTop: 16 }}>Identificação da DPS</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Série</label>
              <input type="text" value={String(previaNfse.payload.serie_dps)} disabled />
            </div>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Número</label>
              <input
                type="text"
                value={previaNfse.payload.numero_dps == null ? '(novo, definido ao confirmar)' : String(previaNfse.payload.numero_dps)}
                disabled
              />
            </div>
            <div className="campo-form" style={{ flex: 2 }}>
              <label>Data/hora de emissão</label>
              <input type="text" value={String(previaNfse.payload.data_emissao)} disabled />
            </div>
          </div>

          {previaNfse.linhas.length > 1 && (
            <>
              <h2 style={{ fontSize: 13, marginTop: 16 }}>Cobrança</h2>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={parceladoConsolidado}
                  onChange={(e) => {
                    setParceladoConsolidado(e.target.checked);
                    if (e.target.checked && parcelasConsolidado.length < 2) {
                      setParcelasConsolidado([
                        { valor: '', vencimento: '', boletoNumero: '', boletoLinhaDigitavel: '' },
                        { valor: '', vencimento: '', boletoNumero: '', boletoLinhaDigitavel: '' },
                      ]);
                    }
                  }}
                />
                Dividir em mais de um boleto (a NF continua sendo UMA só, pro valor total)
              </label>
              {parceladoConsolidado && (
                <div style={{ marginTop: 8 }}>
                  {parcelasConsolidado.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                      <div className="campo-form" style={{ flex: 1, marginBottom: 0 }}>
                        <label>Parcela {i + 1} - Valor (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={p.valor}
                          onChange={(e) =>
                            setParcelasConsolidado((lista) => lista.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="campo-form" style={{ flex: 1, marginBottom: 0 }}>
                        <label>Vencimento</label>
                        <input
                          type="date"
                          value={p.vencimento}
                          onChange={(e) =>
                            setParcelasConsolidado((lista) => lista.map((x, j) => (j === i ? { ...x, vencimento: e.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="campo-form" style={{ flex: 1, marginBottom: 0 }}>
                        <label>Boleto (opcional)</label>
                        <input
                          type="text"
                          value={p.boletoNumero}
                          onChange={(e) =>
                            setParcelasConsolidado((lista) => lista.map((x, j) => (j === i ? { ...x, boletoNumero: e.target.value } : x)))
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="botao-icone perigo"
                        title="Remover parcela"
                        onClick={() => setParcelasConsolidado((lista) => lista.filter((_, j) => j !== i))}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="botao-secundario botao-pequeno"
                    onClick={() =>
                      setParcelasConsolidado((lista) => [...lista, { valor: '', vencimento: '', boletoNumero: '', boletoLinhaDigitavel: '' }])
                    }
                  >
                    + Adicionar parcela
                  </button>
                  <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                    Boleto continua manual (cola o número/linha digitável depois de gerar no banco) - a soma das
                    parcelas precisa bater com o valor total (R$ {previaNfse.resumoSomenteLeitura.valorServico.toFixed(2)}).
                  </p>
                </div>
              )}
            </>
          )}

          {erro && <p className="erro-login">{erro}</p>}

          <div className="modal-acoes">
            <button className="botao-secundario" onClick={fecharPreviaNfse} disabled={emitindoNfseId != null}>
              Cancelar
            </button>
            <button
              className="botao-secundario"
              onClick={salvarDadosTomador}
              disabled={salvandoCadastroTomador || emitindoNfseId != null}
            >
              {salvandoCadastroTomador ? 'Salvando...' : 'Salvar no cadastro'}
            </button>
            <button className="botao-secundario" onClick={visualizarPreviaDanfse} disabled={emitindoNfseId != null}>
              Visualizar DANFE (prévia)
            </button>
            <button className="botao-primario" onClick={confirmarEmissaoNfse} disabled={emitindoNfseId != null}>
              {emitindoNfseId != null ? 'Transmitindo...' : 'Confirmar e transmitir ao SEFAZ'}
            </button>
          </div>
        </ModalJanela>
      )}
      {ModalConfirmacao}
    </div>
  );
}
