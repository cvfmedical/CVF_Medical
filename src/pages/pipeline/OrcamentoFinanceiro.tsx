import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { useAuth } from '../../contexts/AuthContext';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { useRascunhoDeTela } from '../../lib/useRascunhoDeTela';
import { Badge } from '../../components/Badge';
import { urlAssinadaFoto } from '../../lib/storage';
import { abrirJanelaImpressao, escreverImpressao } from '../../lib/imprimir';
import { linkEmail, linkWhatsApp, PORTAL_CLIENTE_URL } from '../../lib/compartilhar';
import { montarCorpoRegistroEntrada, type DadosEntradaParaRelatorio } from '../../lib/relatorioEntrada';
import { montarCorpoRelatorioOS, type ItemRelatorioOS } from '../../lib/relatorioOrdemServico';
import { formatarMoeda, CONDICOES_COMERCIAIS_PADRAO, GARANTIA_CVF, CLAUSULAS_GERAIS } from '../../lib/formato';
import { montarCorpoOrientacaoEsterilizacao } from '../../lib/orientacaoEsterilizacao';
import { IconPhoto, IconTrash } from '@tabler/icons-react';

interface Orcamento {
  id: number;
  numero_orcamento: string;
  status: string;
  ordem_servico_id: number;
  observacoes_tecnico: string | null;
  observacoes_financeiro: string | null;
  aprovacao_manual: boolean | null;
  motivo_aprovacao_manual: string | null;
  valor_fixo_contrato: number | null;
  validade_proposta: string | null;
  condicoes_pagamento: string | null;
  prazo_entrega: string | null;
  ordens_servico: {
    numero_os: string;
    cliente_nome: string;
    cliente_id: number;
    optica_desc: string | null;
    optica_fab: string | null;
    optica_sn: string | null;
  } | null;
}

interface ItemOrcamento {
  id: number;
  produto_servico_id: number | null;
  quantidade: number;
  preco_unitario: number | null;
  observacao: string | null;
  descricao_servico: string | null;
  foto_peca_danificada_path: string | null;
  produtos_servicos: { nome: string; preco_unitario: number | null } | null;
}

interface Cliente {
  id: number;
  razao_social: string;
  telefone: string | null;
  email: string | null;
}

interface PrecoFixoContrato {
  id: number;
  valor_fixo: number;
  catalogo_oticas: { fabricante: string; modelo: string; tipo: string | null } | null;
}

const TONO_STATUS: Record<string, 'copper' | 'teal' | 'danger' | 'neutro'> = {
  'Aguardando Precificação': 'copper',
  'Aguardando Envio ao Cliente': 'copper',
  'Enviado ao Cliente': 'neutro',
  Aprovado: 'teal',
  Recusado: 'danger',
};

// Opções pré-definidas das condições comerciais (o campo continua sendo texto
// livre no banco - estas são só atalhos; "Outro" libera a digitação).
const OPCOES_VALIDADE = ['10 dias', '15 dias', '30 dias'];
const OPCOES_PAGAMENTO = [
  'À vista',
  '28 DDL',
  '2x (28/56 DDL)',
  '3x (28/56/84 DDL)',
  '4x (28/56/84/112 DDL)',
  '50% de sinal; 50% em 15 DDL no faturamento.',
];
const OPCOES_PRAZO = ['3 dias', '4 dias', '5 dias'];

// Select com opções + "Outro" que libera um campo de texto livre.
function CampoSelecao({
  valor,
  aoMudar,
  opcoes,
  placeholder,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: string[];
  placeholder?: string;
}) {
  const [outro, setOutro] = useState(valor !== '' && !opcoes.includes(valor));
  return (
    <>
      <select
        value={outro ? '__outro__' : valor}
        onChange={(e) => {
          if (e.target.value === '__outro__') {
            setOutro(true);
            aoMudar('');
          } else {
            setOutro(false);
            aoMudar(e.target.value);
          }
        }}
      >
        <option value="">Selecione…</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__outro__">Outro (escrever)…</option>
      </select>
      {outro && (
        <input
          style={{ marginTop: 6 }}
          value={valor}
          placeholder={placeholder}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )}
    </>
  );
}

// Opções em botões de rádio (uma só) + "Outro" com campo de texto livre.
function CampoRadio({
  valor,
  aoMudar,
  opcoes,
  placeholder,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: string[];
  placeholder?: string;
}) {
  const [outro, setOutro] = useState(valor !== '' && !opcoes.includes(valor));
  const estiloOpcao = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 } as const;
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {opcoes.map((o) => (
          <label key={o} style={estiloOpcao}>
            <input
              type="radio"
              style={{ width: 'auto' }}
              checked={!outro && valor === o}
              onChange={() => {
                setOutro(false);
                aoMudar(o);
              }}
            />
            {o}
          </label>
        ))}
        <label style={estiloOpcao}>
          <input
            type="radio"
            style={{ width: 'auto' }}
            checked={outro}
            onChange={() => {
              setOutro(true);
              aoMudar('');
            }}
          />
          Outro
        </label>
      </div>
      {outro && (
        <input
          style={{ marginTop: 6 }}
          value={valor}
          placeholder={placeholder}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )}
    </div>
  );
}

export function OrcamentoFinanceiro() {
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [observacoesFinanceiro, setObservacoesFinanceiro] = useState('');
  const [validadeProposta, setValidadeProposta] = useState('');
  const [condicoesPagamento, setCondicoesPagamento] = useState('');
  const [prazoEntrega, setPrazoEntrega] = useState('');
  const [anexarOrientacao, setAnexarOrientacao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Preços editados localmente (controlado) - persistidos em lote ao
  // salvar/enviar, em vez de depender só do onBlur de cada input (mais
  // robusto: funciona mesmo se o usuário for direto no botão).
  const [precos, setPrecos] = useState<Record<number, string>>({});
  const [precoFixoSelecionado, setPrecoFixoSelecionado] = useState('');
  // Valor de contrato aplicado direto no total do orçamento - os itens
  // ficam com preço zerado (só de referência, não somam no total nesse
  // caso). null = precificação normal por item.
  const [valorFixoContrato, setValorFixoContrato] = useState<number | null>(null);
  // Ao restaurar um rascunho minimizado, guarda os preços editados para que o
  // efeito que recarrega os itens não sobrescreva com os valores do banco.
  const precosRestauradosRef = useRef<Record<number, string> | null>(null);

  const orcamentosQuery = useQuery({
    queryKey: ['orcamentos-todos'],
    queryFn: async (): Promise<Orcamento[]> => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select(
          'id, numero_orcamento, status, ordem_servico_id, observacoes_tecnico, observacoes_financeiro, aprovacao_manual, motivo_aprovacao_manual, valor_fixo_contrato, validade_proposta, condicoes_pagamento, prazo_entrega, ordens_servico(numero_os, cliente_nome, cliente_id, optica_desc, optica_fab, optica_sn)',
        )
        .order('data_criacao', { ascending: false });
      if (error) throw error;
      return data as unknown as Orcamento[];
    },
  });

  function nomeItem(item: ItemOrcamento) {
    return item.produtos_servicos?.nome ?? item.descricao_servico ?? '-';
  }

  const orcamentoSelecionado = orcamentosQuery.data?.find((o) => o.id === selecionadoId);
  const naoEnviado =
    orcamentoSelecionado?.status === 'Aguardando Precificação' ||
    orcamentoSelecionado?.status === 'Aguardando Envio ao Cliente';
  const podeAprovarManualmente =
    orcamentoSelecionado?.status === 'Enviado ao Cliente' ||
    orcamentoSelecionado?.status === 'Aguardando Envio ao Cliente';

  const itensQuery = useQuery({
    queryKey: ['itens-orcamento-financeiro', selecionadoId],
    enabled: !!selecionadoId,
    queryFn: async (): Promise<ItemOrcamento[]> => {
      const { data, error } = await supabase
        .from('orcamento_itens')
        .select(
          'id, produto_servico_id, quantidade, preco_unitario, observacao, descricao_servico, foto_peca_danificada_path, produtos_servicos(nome, preco_unitario)',
        )
        .eq('orcamento_id', selecionadoId!);
      if (error) throw error;
      return data as unknown as ItemOrcamento[];
    },
  });

  const clienteQuery = useQuery({
    queryKey: ['cliente-do-orcamento', orcamentoSelecionado?.ordens_servico?.cliente_id],
    enabled: !!orcamentoSelecionado?.ordens_servico?.cliente_id,
    queryFn: async (): Promise<Cliente> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, razao_social, telefone, email')
        .eq('id', orcamentoSelecionado!.ordens_servico!.cliente_id)
        .single();
      if (error) throw error;
      return data as Cliente;
    },
  });

  // Preços fixos negociados em contrato (Comercial > Contratos de
  // manutenção), diferentes por modelo de ótica - o financeiro escolhe
  // o modelo aqui em vez de digitar preço item a item.
  const precosFixosQuery = useQuery({
    queryKey: ['precos-fixos-contrato', orcamentoSelecionado?.ordens_servico?.cliente_id],
    enabled: !!orcamentoSelecionado?.ordens_servico?.cliente_id,
    queryFn: async (): Promise<PrecoFixoContrato[]> => {
      const { data, error } = await supabase
        .from('contrato_precos_fixos')
        .select('id, valor_fixo, catalogo_oticas(fabricante, modelo, tipo), contratos_manutencao!inner(cliente_id, status)')
        .eq('contratos_manutencao.cliente_id', orcamentoSelecionado!.ordens_servico!.cliente_id)
        .eq('contratos_manutencao.status', 'Ativo');
      if (error) throw error;
      return data as unknown as PrecoFixoContrato[];
    },
  });

  useEffect(() => {
    if (!itensQuery.data) return;
    // Restaurando um rascunho minimizado: usa os preços salvos, não os do banco.
    if (precosRestauradosRef.current) {
      setPrecos(precosRestauradosRef.current);
      precosRestauradosRef.current = null;
      return;
    }
    const iniciais: Record<number, string> = {};
    for (const item of itensQuery.data) {
      // Já precificado -> usa o valor salvo. Ainda não precificado -> sugere o
      // preço de venda do catálogo (produtos_servicos.preco_unitario), editável.
      iniciais[item.id] =
        item.preco_unitario != null
          ? String(item.preco_unitario)
          : item.produtos_servicos?.preco_unitario != null
            ? String(item.produtos_servicos.preco_unitario)
            : '';
    }
    setPrecos(iniciais);
  }, [itensQuery.data]);

  // Pré-seleciona automaticamente o preço fixo cujo modelo do catálogo bate com
  // a ótica da OS - assim o financeiro (que nem sempre conhece o material) já
  // vê o modelo identificado. Só deixa escolhido no seletor; aplicar ao total
  // continua sendo uma ação manual (botão "Aplicar ao total").
  useEffect(() => {
    const lista = precosFixosQuery.data;
    const os = orcamentoSelecionado?.ordens_servico;
    if (!lista?.length || !os || precoFixoSelecionado || valorFixoContrato != null) return;
    const alvo = `${os.optica_fab ?? ''} ${os.optica_desc ?? ''}`.toLowerCase();
    const porFabModelo = lista.find((p) => {
      const fab = (p.catalogo_oticas?.fabricante ?? '').toLowerCase();
      const mod = (p.catalogo_oticas?.modelo ?? '').toLowerCase();
      return fab && mod && alvo.includes(fab) && alvo.includes(mod);
    });
    const soFab = lista.filter((p) => {
      const fab = (p.catalogo_oticas?.fabricante ?? '').toLowerCase();
      return fab && alvo.includes(fab);
    });
    const match = porFabModelo ?? (soFab.length === 1 ? soFab[0] : undefined);
    if (match) setPrecoFixoSelecionado(String(match.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precosFixosQuery.data, orcamentoSelecionado]);

  // Minimizar a precificação preservando TODO o formulário (preços, condições,
  // valor fixo, etc.) - sobrevive à navegação entre telas. Restaurar reabre o
  // orçamento (setSelecionadoId) e reaplica os campos.
  const { minimizar: minimizarRascunho } = useRascunhoDeTela('orcamento-financeiro', {
    titulo: `Precificação ${orcamentoSelecionado?.numero_orcamento ?? ''}`,
    obterEstado: () => ({
      selecionadoId,
      precos,
      observacoesFinanceiro,
      validadeProposta,
      condicoesPagamento,
      prazoEntrega,
      precoFixoSelecionado,
      valorFixoContrato,
      anexarOrientacao,
    }),
    aoRestaurar: (e) => {
      precosRestauradosRef.current = (e.precos as Record<number, string>) ?? {};
      setObservacoesFinanceiro((e.observacoesFinanceiro as string) ?? '');
      setValidadeProposta((e.validadeProposta as string) ?? '');
      setCondicoesPagamento((e.condicoesPagamento as string) ?? '');
      setPrazoEntrega((e.prazoEntrega as string) ?? '');
      setPrecoFixoSelecionado((e.precoFixoSelecionado as string) ?? '');
      setValorFixoContrato((e.valorFixoContrato as number | null) ?? null);
      setAnexarOrientacao(Boolean(e.anexarOrientacao));
      setErro(null);
      setSelecionadoId((e.selecionadoId as number | null) ?? null);
    },
  });

  function minimizarFinanceiro() {
    minimizarRascunho();
    setSelecionadoId(null);
  }

  const total =
    valorFixoContrato != null
      ? valorFixoContrato
      : (itensQuery.data ?? []).reduce((soma, item) => soma + (Number(precos[item.id]) || 0) * item.quantidade, 0);

  // Valor de contrato vira o total do orçamento direto - os itens ficam
  // com preço zerado (só de referência de quais peças foram usadas, não
  // entram na soma). O gatilho que cria a conta a receber (021/024/033)
  // já sabe usar orcamentos.valor_fixo_contrato quando ele está setado.
  function aplicarPrecoFixo() {
    const preco = precosFixosQuery.data?.find((p) => String(p.id) === precoFixoSelecionado);
    if (!preco || !itensQuery.data?.length) return;
    const zerados: Record<number, string> = {};
    for (const item of itensQuery.data) {
      zerados[item.id] = '0';
    }
    setPrecos(zerados);
    setValorFixoContrato(preco.valor_fixo);
  }

  function removerValorFixo() {
    setValorFixoContrato(null);
    setPrecoFixoSelecionado('');
  }

  async function verFoto(caminho: string | null) {
    if (!caminho) return;
    const url = await urlAssinadaFoto(caminho);
    if (url) window.open(url, '_blank');
  }

  function mensagemCompartilhar() {
    return `Olá! Segue o orçamento ${orcamentoSelecionado?.numero_orcamento} (OS ${orcamentoSelecionado?.ordens_servico?.numero_os}) no valor de ${formatarMoeda(total)}. Acompanhe e aprove pelo portal do cliente: ${PORTAL_CLIENTE_URL}`;
  }

  async function buscarRegistroEntradaHtml(): Promise<string> {
    if (!orcamentoSelecionado) return '';
    const { data: entrada } = await supabase
      .from('entradas_equipamento')
      .select(
        'id, codigo_entrada, condicao_chegada, data_entrada, numero_controle_cliente, nf_remessa_numero, nf_remessa_serie, nf_remessa_cfop, nf_remessa_chave_acesso, nf_remessa_data_emissao, nf_remessa_valor, triagem_avarias',
      )
      .eq('ordem_servico_id', orcamentoSelecionado.ordem_servico_id)
      .maybeSingle();

    if (!entrada) {
      return `<div class="secao">Registro de Entrada</div><p>Nenhum registro de entrada encontrado para esta OS.</p>`;
    }

    const { data: fotos } = await supabase
      .from('fotos_entrada')
      .select('storage_path')
      .eq('entrada_id', entrada.id);
    const urls = fotos ? (await Promise.all(fotos.map((f) => urlAssinadaFoto(f.storage_path)))).filter((u): u is string => !!u) : [];

    const dados: DadosEntradaParaRelatorio = {
      ...entrada,
      equipamento_desc: orcamentoSelecionado.ordens_servico?.optica_desc ?? null,
      equipamento_fab: orcamentoSelecionado.ordens_servico?.optica_fab ?? null,
      equipamento_sn: orcamentoSelecionado.ordens_servico?.optica_sn ?? null,
      defeito_relatado: null,
    };
    return montarCorpoRegistroEntrada(clienteQuery.data ? { razao_social: clienteQuery.data.razao_social } : undefined, dados, urls);
  }

  // Relatório da Ordem de Serviço (peças danificadas identificadas pelo
  // técnico) - montado a partir dos itens do orçamento já carregados,
  // com as fotos de cada peça.
  async function buscarRelatorioOSHtml(): Promise<string> {
    if (!orcamentoSelecionado?.ordens_servico) return '';
    const itens: ItemRelatorioOS[] = await Promise.all(
      (itensQuery.data ?? []).map(async (item) => ({
        nome: item.produtos_servicos?.nome ?? item.descricao_servico ?? '-',
        quantidade: item.quantidade,
        observacao: item.observacao,
        fotoUrl: item.foto_peca_danificada_path ? await urlAssinadaFoto(item.foto_peca_danificada_path) : null,
      })),
    );
    return montarCorpoRelatorioOS(
      {
        numero_os: orcamentoSelecionado.ordens_servico.numero_os,
        cliente_nome: orcamentoSelecionado.ordens_servico.cliente_nome,
        optica_desc: orcamentoSelecionado.ordens_servico.optica_desc,
        optica_fab: orcamentoSelecionado.ordens_servico.optica_fab,
        optica_sn: orcamentoSelecionado.ordens_servico.optica_sn,
        defeito_relatado: null,
      },
      itens,
    );
  }

  // Links de compartilhamento (WhatsApp/e-mail) - o mesmo para os 3 documentos:
  // aponta o cliente para o portal, onde ele acessa cada relatório em separado.
  function linksCompart() {
    if (!clienteQuery.data || !orcamentoSelecionado) return undefined;
    return {
      whatsapp: linkWhatsApp(clienteQuery.data.telefone, mensagemCompartilhar()),
      email: linkEmail(
        clienteQuery.data.email,
        `Q-CVF Medical - Orçamento ${orcamentoSelecionado.numero_orcamento}`,
        mensagemCompartilhar(),
      ),
    };
  }

  // Corpo do documento do Orçamento (itens + condições comerciais + garantia +
  // condições gerais + observações). O texto legal fica compacto e agrupado
  // (page-break-inside:avoid) para não se espalhar por mais de uma página.
  function montarOrcamentoHtml() {
    const os = orcamentoSelecionado!.ordens_servico;
    const linhas = (itensQuery.data ?? [])
      .map(
        (item) => `
        <tr>
          <td>${item.produtos_servicos?.nome ?? item.descricao_servico ?? ''}</td>
          <td>${item.quantidade}</td>
          <td>${formatarMoeda(Number(precos[item.id]) || 0)}</td>
          <td>${formatarMoeda((Number(precos[item.id]) || 0) * item.quantidade)}</td>
        </tr>`,
      )
      .join('');

    return `
      <h1>Orçamento de Manutenção</h1>
      <p class="subtitulo">Nº ${orcamentoSelecionado!.numero_orcamento} · OS ${os?.numero_os ?? '-'} · ${os?.cliente_nome ?? '-'}</p>
      <p class="subtitulo">${os?.optica_desc ?? '-'}${os?.optica_fab ? ' (' + os.optica_fab + ')' : ''}${os?.optica_sn ? ' · Nº série ' + os.optica_sn : ''}</p>
      <div class="secao">Itens</div>
      <table class="dados">
        <thead><tr><th>Item</th><th>Qtd.</th><th>Preço unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <p class="total-linha">Total: ${formatarMoeda(total)}</p>
      <div class="secao">Condições comerciais</div>
      <div class="linha"><div class="rotulo">Validade da proposta</div><div class="valor">${validadeProposta || '-'}</div></div>
      <div class="linha"><div class="rotulo">Condições de pagamento</div><div class="valor">${condicoesPagamento || '-'}</div></div>
      <div class="linha"><div class="rotulo">Prazo de entrega</div><div class="valor">${prazoEntrega || '-'}</div></div>
      <div style="page-break-inside:avoid;font-size:10px;line-height:1.32;color:var(--ink-600);margin-top:8px;">
        <div class="secao" style="margin-bottom:4px;">Garantia</div>
        <div style="font-size:11px;color:var(--ink-900);margin-bottom:2px;">${GARANTIA_CVF.resumo}</div>
        <p style="margin:3px 0;">${GARANTIA_CVF.intro}</p>
        <ol style="margin:0;padding-left:16px;">
          ${GARANTIA_CVF.itens.map((i) => `<li>${i}</li>`).join('')}
        </ol>
        <div class="secao" style="margin:8px 0 4px;">Condições gerais</div>
        ${CLAUSULAS_GERAIS.map((c) => `<p style="margin:0 0 4px;"><strong>${c.titulo}.</strong> ${c.texto}</p>`).join('')}
        <div class="secao" style="margin:8px 0 4px;">Observações</div>
        <div>${observacoesFinanceiro || '-'}</div>
      </div>`;
  }

  // Um clique em "Imprimir" gera os 3 documentos SEPARADOS (Registro de
  // Entrada, Ordem de Serviço e Orçamento), cada um em sua janela, para o
  // usuário salvar 3 PDFs distintos e anexá-los ao e-mail/WhatsApp do cliente
  // (o cliente então escolhe qual imprimir). As 3 janelas são abertas JÁ no
  // clique (antes dos dados assíncronos) para não cair no bloqueador de pop-up.
  async function imprimirTresDocumentos() {
    if (!orcamentoSelecionado) return;
    const jEntrada = abrirJanelaImpressao();
    const jOS = abrirJanelaImpressao();
    const jOrc = abrirJanelaImpressao();
    if (!jEntrada || !jOS || !jOrc) {
      alert('Libere os pop-ups deste site para gerar os 3 arquivos de uma vez.');
      return;
    }
    const num = orcamentoSelecionado.numero_orcamento;
    const numOS = orcamentoSelecionado.ordens_servico?.numero_os ?? num;
    const [entradaHtml, osHtml] = await Promise.all([buscarRegistroEntradaHtml(), buscarRelatorioOSHtml()]);

    // Registro de Entrada já traz suas próprias assinaturas dentro do corpo.
    escreverImpressao(jEntrada, `Registro de Entrada - ${num}`, entradaHtml, linksCompart(), { semAssinaturas: true });
    escreverImpressao(jOS, `Ordem de Serviço - ${numOS}`, osHtml, linksCompart(), { semAssinaturas: true });
    escreverImpressao(jOrc, `Orçamento ${num}`, montarOrcamentoHtml(), linksCompart(), {
      assinaturas: ['Q-CVF Medical (Financeiro)', 'Cliente (aprovação)'],
      anexoHtml: anexarOrientacao ? montarCorpoOrientacaoEsterilizacao() : undefined,
    });
  }

  function compartilhar(vetorEnvio: 'whatsapp' | 'email') {
    if (!orcamentoSelecionado || !clienteQuery.data) return;
    const mensagem = mensagemCompartilhar();
    if (vetorEnvio === 'whatsapp') {
      window.open(linkWhatsApp(clienteQuery.data.telefone, mensagem), '_blank');
    } else {
      window.open(
        linkEmail(clienteQuery.data.email, `Q-CVF Medical - Orçamento ${orcamentoSelecionado.numero_orcamento}`, mensagem),
        '_blank',
      );
    }
  }

  function abrirOrcamento(o: Orcamento) {
    setSelecionadoId(o.id);
    setObservacoesFinanceiro(o.observacoes_financeiro ?? '');
    setValidadeProposta(o.validade_proposta ?? CONDICOES_COMERCIAIS_PADRAO.validadeProposta);
    setCondicoesPagamento(o.condicoes_pagamento ?? CONDICOES_COMERCIAIS_PADRAO.condicoesPagamento);
    setPrazoEntrega(o.prazo_entrega ?? CONDICOES_COMERCIAIS_PADRAO.prazoEntrega);
    setPrecoFixoSelecionado('');
    setValorFixoContrato(o.valor_fixo_contrato ?? null);
    setAnexarOrientacao(false);
    setErro(null);
  }

  async function persistirPrecosEObservacoes() {
    for (const item of itensQuery.data ?? []) {
      const valor = precos[item.id];
      const preco = valor ? Number(valor) : null;
      if (preco !== item.preco_unitario) {
        const { error } = await supabase.from('orcamento_itens').update({ preco_unitario: preco }).eq('id', item.id);
        if (error) throw error;
      }
    }
    const { error } = await supabase
      .from('orcamentos')
      .update({
        observacoes_financeiro: observacoesFinanceiro || null,
        valor_fixo_contrato: valorFixoContrato,
        validade_proposta: validadeProposta || null,
        condicoes_pagamento: condicoesPagamento || null,
        prazo_entrega: prazoEntrega || null,
      })
      .eq('id', selecionadoId!);
    if (error) throw error;
  }

  async function salvarAlteracoes() {
    if (!selecionadoId || !orcamentoSelecionado) return;
    setErro(null);
    setSalvando(true);
    try {
      await persistirPrecosEObservacoes();
      // Assim que a precificação começa a ser salva, o orçamento sai de
      // "aguardando precificação" para "aguardando envio ao cliente" -
      // o gatilho no banco já mantém o status da OS em sincronia.
      if (orcamentoSelecionado.status === 'Aguardando Precificação') {
        const { error } = await supabase
          .from('orcamentos')
          .update({ status: 'Aguardando Envio ao Cliente' })
          .eq('id', selecionadoId);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ['itens-orcamento-financeiro', selecionadoId] });
      qc.invalidateQueries({ queryKey: ['orcamentos-todos'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAoCliente() {
    if (!selecionadoId || !orcamentoSelecionado) return;
    setErro(null);
    setEnviando(true);
    // Abre o Gmail JÁ (dentro do clique, antes das chamadas assíncronas, para
    // não cair no bloqueador de pop-up) com texto padrão + e-mail do cliente.
    // Os arquivos não podem ser anexados por link - o usuário anexa os PDFs
    // gerados em "Imprimir (3 arquivos)", ou o cliente acessa pelo portal.
    if (clienteQuery.data?.email) {
      window.open(
        linkEmail(
          clienteQuery.data.email,
          `Q-CVF Medical - Orçamento ${orcamentoSelecionado.numero_orcamento}`,
          mensagemCompartilhar(),
        ),
        '_blank',
      );
    }
    try {
      await persistirPrecosEObservacoes();

      const { error } = await supabase
        .from('orcamentos')
        .update({
          status: 'Enviado ao Cliente',
          precificado_por: funcionario?.id ?? null,
          data_envio: new Date().toISOString(),
        })
        .eq('id', selecionadoId);
      if (error) throw error;

      await supabase
        .from('ordens_servico')
        .update({ status_os: '3. AGUARDANDO APROVAÇÃO DO CLIENTE' })
        .eq('id', orcamentoSelecionado.ordem_servico_id);

      setSelecionadoId(null);
      setObservacoesFinanceiro('');
      qc.invalidateQueries({ queryKey: ['orcamentos-todos'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  async function aprovarManualmente() {
    if (!selecionadoId || !orcamentoSelecionado) return;
    const motivo = prompt(
      'Motivo da aprovação manual (o cliente não usou o portal/link - ex: aprovou por telefone). Esse texto fica salvo no orçamento:',
    );
    if (motivo === null) return; // usuário cancelou
    if (!motivo.trim()) {
      alert('Informe o motivo para registrar a aprovação manual.');
      return;
    }
    setErro(null);
    try {
      const { error } = await supabase
        .from('orcamentos')
        .update({
          status: 'Aprovado',
          data_resposta_cliente: new Date().toISOString(),
          aprovacao_manual: true,
          motivo_aprovacao_manual: motivo.trim(),
          aprovado_manualmente_por: funcionario?.id ?? null,
        })
        .eq('id', selecionadoId);
      if (error) throw error;
      setSelecionadoId(null);
      qc.invalidateQueries({ queryKey: ['orcamentos-todos'] });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function excluirItem(itemId: number) {
    if (!confirm('Remover este item do orçamento?')) return;
    const { error } = await supabase.from('orcamento_itens').delete().eq('id', itemId);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['itens-orcamento-financeiro', selecionadoId] });
  }

  async function excluirOrcamento() {
    if (!selecionadoId || !orcamentoSelecionado) return;
    if (!confirm(`Excluir o orçamento ${orcamentoSelecionado.numero_orcamento} inteiro? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('orcamentos').delete().eq('id', selecionadoId);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    setSelecionadoId(null);
    qc.invalidateQueries({ queryKey: ['orcamentos-todos'] });
  }

  if (orcamentosQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Precificar orçamentos</h1>

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Nº orçamento</th>
            <th>OS</th>
            <th>Cliente</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(orcamentosQuery.data ?? []).map((o) => (
            <tr key={o.id}>
              <td className="mono">{o.numero_orcamento}</td>
              <td className="mono">{o.ordens_servico?.numero_os}</td>
              <td>{o.ordens_servico?.cliente_nome}</td>
              <td>
                <Badge tono={TONO_STATUS[o.status] ?? 'neutro'}>{o.status}</Badge>
              </td>
              <td className="acoes-tabela">
                <button className="botao-secundario" onClick={() => abrirOrcamento(o)}>
                  {o.status === 'Aguardando Precificação' || o.status === 'Aguardando Envio ao Cliente'
                    ? 'Precificar'
                    : 'Ver / reimprimir'}
                </button>
              </td>
            </tr>
          ))}
          {(orcamentosQuery.data ?? []).length === 0 && (
            <tr>
              <td colSpan={5}>Nenhum orçamento encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {selecionadoId && orcamentoSelecionado && (
        <ModalJanela
          titulo={
            <>
              {orcamentoSelecionado.numero_orcamento}{' '}
              <Badge tono={TONO_STATUS[orcamentoSelecionado.status] ?? 'neutro'}>
                {orcamentoSelecionado.status}
              </Badge>
            </>
          }
          aoFechar={() => setSelecionadoId(null)}
          aoMinimizar={minimizarFinanceiro}
          larguraMax={640}
        >
            {orcamentoSelecionado.ordens_servico && (
              <div
                style={{
                  background: 'var(--azul-cvf-12)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                <strong>Ótica da OS {orcamentoSelecionado.ordens_servico.numero_os}:</strong>{' '}
                {[orcamentoSelecionado.ordens_servico.optica_fab, orcamentoSelecionado.ordens_servico.optica_desc]
                  .filter(Boolean)
                  .join(' ') || '—'}
                {orcamentoSelecionado.ordens_servico.optica_sn
                  ? ` · Nº série ${orcamentoSelecionado.ordens_servico.optica_sn}`
                  : ''}
              </div>
            )}

            {(precosFixosQuery.data ?? []).length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-end',
                  background: 'var(--paper-50)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 12,
                }}
              >
                <div className="campo-form" style={{ flex: 1, marginBottom: 0 }}>
                  <label>Valor fixo do contrato (por modelo de ótica)</label>
                  <select value={precoFixoSelecionado} onChange={(e) => setPrecoFixoSelecionado(e.target.value)}>
                    <option value="">Selecione o modelo...</option>
                    {(precosFixosQuery.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.catalogo_oticas?.fabricante} - {p.catalogo_oticas?.modelo}
                        {p.catalogo_oticas?.tipo ? ` (${p.catalogo_oticas.tipo})` : ''} - {formatarMoeda(p.valor_fixo)}
                      </option>
                    ))}
                  </select>
                </div>
                {valorFixoContrato != null ? (
                  <button className="botao-secundario perigo" onClick={removerValorFixo}>
                    Remover valor fixo
                  </button>
                ) : (
                  <button className="botao-secundario" onClick={aplicarPrecoFixo} disabled={!precoFixoSelecionado}>
                    Aplicar ao total
                  </button>
                )}
              </div>
            )}

            {valorFixoContrato != null && (
              <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: -8, marginBottom: 12 }}>
                Valor fixo de contrato aplicado ({formatarMoeda(valorFixoContrato)}) - os preços dos itens abaixo
                ficam só de referência, não somam no total.
              </p>
            )}

            <table className="tabela-crud">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qtd.</th>
                  <th>Preço unitário (R$)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(itensQuery.data ?? []).map((item) => (
                  <tr key={item.id}>
                    <td>{nomeItem(item)}</td>
                    <td>{item.quantidade}</td>
                    <td>
                      <input
                        type="number"
                        value={precos[item.id] ?? ''}
                        onChange={(e) => setPrecos((p) => ({ ...p, [item.id]: e.target.value }))}
                        disabled={valorFixoContrato != null}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td className="acoes-tabela">
                      {item.foto_peca_danificada_path && (
                        <button className="botao-icone" title="Ver foto da peça" onClick={() => verFoto(item.foto_peca_danificada_path)}>
                          <IconPhoto size={16} />
                        </button>
                      )}
                      <button className="botao-icone perigo" title="Remover item" onClick={() => excluirItem(item.id)}>
                        <IconTrash size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(itensQuery.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4}>Nenhum item neste orçamento.</td>
                  </tr>
                )}
              </tbody>
            </table>

            <p style={{ fontSize: 11, color: 'var(--ink-400)', margin: '2px 0 0' }}>
              O preço unitário já vem sugerido do catálogo (valor de venda) quando o item está cadastrado — ajuste
              livremente antes de salvar/enviar.
            </p>
            <p style={{ textAlign: 'right', fontWeight: 500 }}>Total: {formatarMoeda(total)}</p>

            <div className="campo-form">
              <label>Validade da proposta</label>
              <CampoSelecao
                valor={validadeProposta}
                aoMudar={setValidadeProposta}
                opcoes={OPCOES_VALIDADE}
                placeholder="Ex.: 20 dias"
              />
            </div>
            <div className="campo-form">
              <label>Condições de pagamento</label>
              <CampoSelecao
                valor={condicoesPagamento}
                aoMudar={setCondicoesPagamento}
                opcoes={OPCOES_PAGAMENTO}
                placeholder="Escreva a condição de pagamento"
              />
            </div>
            <div className="campo-form">
              <label>Prazo de entrega</label>
              <CampoRadio
                valor={prazoEntrega}
                aoMudar={setPrazoEntrega}
                opcoes={OPCOES_PRAZO}
                placeholder="Escreva o prazo"
              />
            </div>

            <div className="campo-form">
              <label>Observações do financeiro</label>
              <textarea value={observacoesFinanceiro} onChange={(e) => setObservacoesFinanceiro(e.target.value)} />
            </div>

            <div className="campo-form">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={anexarOrientacao}
                  onChange={(e) => setAnexarOrientacao(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Anexar a orientação de esterilização ao relatório
              </label>
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Inclui, ao final, a orientação de manuseio/limpeza/esterilização das ópticas (para o cliente repassar ao hospital).
              </p>
            </div>
            {orcamentoSelecionado.observacoes_tecnico && (
              <div className="campo-form">
                <label>Observações do técnico</label>
                <p style={{ fontSize: 13 }}>{orcamentoSelecionado.observacoes_tecnico}</p>
              </div>
            )}
            {orcamentoSelecionado.aprovacao_manual && (
              <div className="campo-form">
                <label>Aprovação manual (fora do portal/link)</label>
                <p style={{ fontSize: 13 }}>{orcamentoSelecionado.motivo_aprovacao_manual}</p>
              </div>
            )}

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="botao-secundario"
                  onClick={() => imprimirTresDocumentos()}
                  title="Gera os 3 arquivos: Registro de Entrada, Ordem de Serviço e Orçamento"
                >
                  Imprimir (3 arquivos)
                </button>
                <button className="botao-secundario" onClick={() => compartilhar('whatsapp')}>
                  WhatsApp
                </button>
                <button className="botao-secundario" onClick={() => compartilhar('email')}>
                  E-mail
                </button>
                <button className="botao-secundario perigo" onClick={excluirOrcamento}>
                  Excluir orçamento
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="botao-secundario" onClick={() => setSelecionadoId(null)}>
                  Fechar
                </button>
                <button className="botao-secundario" onClick={salvarAlteracoes} disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar alterações'}
                </button>
                {podeAprovarManualmente && (
                  <button className="botao-secundario" onClick={aprovarManualmente}>
                    Aprovar manualmente
                  </button>
                )}
                {naoEnviado && (
                  <button className="botao-primario" onClick={enviarAoCliente} disabled={enviando}>
                    {enviando ? 'Enviando...' : 'Enviar ao cliente'}
                  </button>
                )}
              </div>
            </div>
        </ModalJanela>
      )}
    </div>
  );
}
