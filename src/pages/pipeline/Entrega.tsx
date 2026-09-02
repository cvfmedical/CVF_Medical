import { useNavigate } from 'react-router-dom';
import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { STATUS_DEVOLUCAO_SEM_REPARO, STATUS_PRONTO_ENTREGA } from '../../lib/statusOS';
import { imprimirOrientacaoEsterilizacao } from '../../lib/orientacaoEsterilizacao';
import { imprimirEtiquetaDespacho, imprimirEtiquetasDespachoLote, type DadosEtiquetaDespacho } from '../../lib/etiquetaDespacho';
import { IconPrinter, IconTruckDelivery } from '@tabler/icons-react';
import { mensagemErro } from '../../lib/erros';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useEntradaOrcamentoPorOS } from '../../lib/useEntradaOrcamentoPorOS';
import { linkEmail } from '../../lib/compartilhar';
import { ModalJanela } from '../../components/ModalJanela';

interface EntregaRow {
  id: number;
  ordem_servico_id: number;
  forma_devolucao: string;
  detalhes: string | null;
  codigo_rastreio: string | null;
  data_entrega: string | null;
  nf_devolucao_numero: string | null;
  nf_devolucao_serie: string | null;
  nf_devolucao_chave_acesso: string | null;
  nf_devolucao_cfop: string | null;
  nf_devolucao_data_emissao: string | null;
  nf_devolucao_valor: number | null;
  confirmado_pelo_cliente_em: string | null;
  finalizado_manualmente_em: string | null;
}

export function Entrega() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { funcionario } = useAuth();
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  const { codigoEntradaPorOS } = useEntradaOrcamentoPorOS();
  const [imprimindoLote, setImprimindoLote] = useState(false);
  const [selecionandoEtiquetas, setSelecionandoEtiquetas] = useState(false);
  const [osSelecionadas, setOsSelecionadas] = useState<Set<number>>(new Set());

  // Nº do orçamento de cada OS - pra saber a que orçamento essa entrega se
  // refere, sem precisar abrir a OS. Com orçamentos alternativos, prioriza
  // o Aprovado (é o que "vale" - a essa altura do pipeline já tem um).
  const orcamentosQuery = useQuery({
    queryKey: ['orcamentos-numero-por-os'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('id, numero_orcamento, ordem_servico_id, status')
        .order('id', { ascending: false });
      if (error) throw error;
      return data as { id: number; numero_orcamento: string; ordem_servico_id: number; status: string }[];
    },
  });
  function orcamentoPorOS(osId: number): { id: number; numero: string } | null {
    const doOS = orcamentosQuery.data?.filter((o) => o.ordem_servico_id === osId) ?? [];
    const o = doOS.find((o) => o.status === 'Aprovado') ?? doOS[0];
    return o ? { id: o.id, numero: o.numero_orcamento } : null;
  }

  // OS's que já têm entrega registrada - precisam continuar selecionáveis
  // no combobox e passar na validação ao EDITAR essa entrega, mesmo que o
  // status já tenha avançado pra "Entregue" (efeito esperado de já ter
  // sido entregue antes). Sem isso, editar uma entrega já salva mostrava
  // o campo "Ordem de serviço" em branco e travava com "OS não liberada".
  // Também usada pra montar o painel de seleção "enviar rastreio em lote" -
  // por isso já traz id e codigo_rastreio, não só ordem_servico_id.
  const entregasExistentesQuery = useQuery({
    queryKey: ['entregas-os-ids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entregas')
        .select('id, ordem_servico_id, codigo_rastreio, confirmado_pelo_cliente_em, finalizado_manualmente_em');
      if (error) throw error;
      return data as {
        id: number;
        ordem_servico_id: number;
        codigo_rastreio: string | null;
        confirmado_pelo_cliente_em: string | null;
        finalizado_manualmente_em: string | null;
      }[];
    },
  });

  // Só pro botão "Enviar por e-mail" do código de rastreio - não precisa
  // de mais nada do cliente além do e-mail.
  const clientesEmailQuery = useQuery({
    queryKey: ['clientes-email-entrega'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, email');
      if (error) throw error;
      return data as { id: number; email: string | null }[];
    },
  });

  function enviarRastreioPorEmail(row: EntregaRow) {
    const os = porId(row.ordem_servico_id);
    const orc = orcamentoPorOS(row.ordem_servico_id);
    const email = os ? clientesEmailQuery.data?.find((c) => c.id === os.cliente_id)?.email : null;
    const corpo = `Olá! Segue o código de rastreio dos Correios referente ao orçamento ${orc?.numero ?? row.ordem_servico_id}. Código de rastreio: ${row.codigo_rastreio}. Acompanhe em https://rastreamento.correios.com.br/app/index.php`;
    window.open(
      linkEmail(email, `RASTREAMENTO REFERENTE AOS ORÇAMENTOS ${orc?.numero ?? ''}`, corpo),
      '_blank',
    );
  }

  // Atalho dedicado só pro código de rastreio - sem precisar abrir o
  // formulário genérico de edição (que mistura o campo com NF de
  // devolução, forma de devolução, etc.). Trabalha com uma LISTA de
  // entregas (não só uma) porque na prática a maioria dos pacotes reúne
  // vários orçamentos/OS do mesmo cliente sob um único código de rastreio -
  // por isso só precisa de id/ordem_servico_id/codigo_rastreio de cada uma,
  // não da linha inteira (essas 3 colunas já vêm de entregasExistentesQuery).
  interface RastreioAlvo {
    id: number;
    ordem_servico_id: number;
    codigo_rastreio: string | null;
  }
  const [linhasEditandoRastreio, setLinhasEditandoRastreio] = useState<RastreioAlvo[] | null>(null);
  const [novoCodigoRastreio, setNovoCodigoRastreio] = useState('');
  const [salvandoRastreio, setSalvandoRastreio] = useState(false);
  const [erroRastreio, setErroRastreio] = useState<string | null>(null);
  const [arquivoEtiqueta, setArquivoEtiqueta] = useState<File | null>(null);
  const [enviandoAutomatico, setEnviandoAutomatico] = useState(false);
  const [enviadoAutomatico, setEnviadoAutomatico] = useState(false);

  // Painel de seleção (mesmo padrão do "Selecionar etiquetas para
  // imprimir") pra juntar várias entregas do mesmo cliente antes de abrir
  // o modal de rastreio.
  const [selecionandoRastreio, setSelecionandoRastreio] = useState(false);
  const [entregasSelecionadasRastreio, setEntregasSelecionadasRastreio] = useState<Set<number>>(new Set());
  const entregasSemRastreio = (entregasExistentesQuery.data ?? []).filter(
    (e) => !e.codigo_rastreio && !e.confirmado_pelo_cliente_em && !e.finalizado_manualmente_em,
  );

  function alternarSelecaoEntregaRastreio(id: number) {
    setEntregasSelecionadasRastreio((s) => {
      const nova = new Set(s);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  // Cliente das entregas selecionadas - null se estiverem vazias OU se
  // misturarem mais de um cliente (não faz sentido mandar um e-mail só pra
  // um pacote com OS de clientes diferentes).
  function clienteComumDas(linhas: RastreioAlvo[]): number | null {
    const clienteIds = new Set(linhas.map((l) => porId(l.ordem_servico_id)?.cliente_id).filter((id): id is number => id != null));
    return clienteIds.size === 1 ? [...clienteIds][0] : null;
  }

  function abrirEdicaoRastreio(linhas: RastreioAlvo[]) {
    setLinhasEditandoRastreio(linhas);
    setNovoCodigoRastreio(linhas.find((l) => l.codigo_rastreio)?.codigo_rastreio ?? '');
    setArquivoEtiqueta(null);
    setEnviadoAutomatico(false);
    setErroRastreio(null);
  }

  function continuarSelecaoRastreio() {
    const linhas = entregasSemRastreio.filter((e) => entregasSelecionadasRastreio.has(e.id));
    if (linhas.length === 0) return;
    if (clienteComumDas(linhas) == null) return;
    abrirEdicaoRastreio(linhas);
    setSelecionandoRastreio(false);
    setEntregasSelecionadasRastreio(new Set());
  }

  // Texto usado no assunto/corpo do e-mail - "ORC-1 / ORC-2 / ORC-3" pra
  // quantos orçamentos estiverem no pacote (normalmente mais de um).
  function numerosOrcamentoTexto(linhas: RastreioAlvo[]): string {
    return linhas
      .map((l) => orcamentoPorOS(l.ordem_servico_id)?.numero ?? `OS #${l.ordem_servico_id}`)
      .join(' / ');
  }

  async function salvarCodigoRastreio(codigo: string) {
    if (!linhasEditandoRastreio || linhasEditandoRastreio.length === 0) return;
    const { error } = await supabase
      .from('entregas')
      .update({ codigo_rastreio: codigo.trim() || null })
      .in(
        'id',
        linhasEditandoRastreio.map((l) => l.id),
      );
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['entregas'] });
    qc.invalidateQueries({ queryKey: ['entregas-os-ids'] });
  }

  async function salvarRastreio() {
    if (!linhasEditandoRastreio) return;
    setSalvandoRastreio(true);
    setErroRastreio(null);
    try {
      await salvarCodigoRastreio(novoCodigoRastreio);
      setLinhasEditandoRastreio(null);
    } catch (e) {
      setErroRastreio(mensagemErro(e));
    } finally {
      setSalvandoRastreio(false);
    }
  }

  function arquivoParaBase64(arquivo: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => {
        // data:application/pdf;base64,XXXX - o Resend só quer o "XXXX".
        const resultado = String(leitor.result);
        resolve(resultado.slice(resultado.indexOf(',') + 1));
      };
      leitor.onerror = () => reject(leitor.error);
      leitor.readAsDataURL(arquivo);
    });
  }

  // Salva o código nas entregas selecionadas, monta o e-mail (com a
  // etiqueta em PDF anexada, se escolhida) e dispara pelo Resend via a
  // mesma function que já envia orçamento - já sai da caixa da CVF, sem
  // precisar do Gmail do técnico.
  async function enviarRastreioAutomatico() {
    if (!linhasEditandoRastreio || linhasEditandoRastreio.length === 0) return;
    if (!novoCodigoRastreio.trim()) {
      setErroRastreio('Informe o código de rastreio antes de enviar.');
      return;
    }
    const clienteId = clienteComumDas(linhasEditandoRastreio);
    const email = clienteId != null ? clientesEmailQuery.data?.find((c) => c.id === clienteId)?.email : null;
    if (!email) {
      setErroRastreio('Cliente sem e-mail cadastrado - corrija em Cadastros → Clientes, ou use "Enviar rastreio" (abre no seu e-mail).');
      return;
    }
    setEnviandoAutomatico(true);
    setErroRastreio(null);
    try {
      await salvarCodigoRastreio(novoCodigoRastreio);
      const anexos = arquivoEtiqueta
        ? [{ filename: arquivoEtiqueta.name || 'etiqueta-despacho.pdf', content: await arquivoParaBase64(arquivoEtiqueta) }]
        : [];
      const numeros = numerosOrcamentoTexto(linhasEditandoRastreio);
      const html = `
        <p>Olá!</p>
        <p>Segue o código de rastreio dos Correios referente aos orçamentos ${numeros}.</p>
        <p><strong>Código de rastreio:</strong> ${novoCodigoRastreio.trim()}</p>
        <p>Acompanhe a entrega em: <a href="https://rastreamento.correios.com.br/app/index.php">rastreamento.correios.com.br</a>.</p>
        <p>Qualquer dúvida, estamos à disposição.</p>
        <p>Atenciosamente,<br>CVF Medical</p>
      `;
      const { data, error } = await supabase.functions.invoke('enviar-orcamento', {
        body: {
          to: email,
          subject: `RASTREAMENTO REFERENTE AOS ORÇAMENTOS ${numeros}`,
          html,
          anexos,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao enviar o e-mail.');
      setEnviadoAutomatico(true);
    } catch (e) {
      setErroRastreio(mensagemErro(e));
    } finally {
      setEnviandoAutomatico(false);
    }
  }

  if (isLoading || orcamentosQuery.isLoading || entregasExistentesQuery.isLoading) return <CarregandoTela />;

  // Porteira: só entra na entrega quem terminou o fluxo ("Pronto para entrega")
  // ou saiu por devolução sem reparo (orçamento recusado).
  const podeEntregar = (osId: number) => {
    const s = porId(osId)?.status_os;
    return s === STATUS_PRONTO_ENTREGA || s === STATUS_DEVOLUCAO_SEM_REPARO;
  };
  const temEntregaRegistrada = (osId: number) =>
    entregasExistentesQuery.data?.some((e) => e.ordem_servico_id === osId) ?? false;
  // Combobox do formulário (criar/editar entrega) precisa continuar incluindo
  // OS já com entrega registrada, senão editar uma entrega já salva mostra o
  // campo em branco (ver comentário de entregasExistentesQuery acima).
  const opcoesEntrega = opcoes.filter((o) => podeEntregar(Number(o.value)) || temEntregaRegistrada(Number(o.value)));
  // Checklist de impressão de etiqueta é outra coisa: só interessa quem
  // ainda não teve etiqueta impressa - assim que imprime (em lote, pela
  // linha da tabela ou pelo formulário), a OS sai daqui e só é encontrável
  // depois via busca (Histórico do equipamento).
  const opcoesParaImprimir = opcoes.filter(
    (o) => podeEntregar(Number(o.value)) && !porId(Number(o.value))?.etiqueta_despacho_impressa_em,
  );

  function alternarSelecaoOS(id: number) {
    setOsSelecionadas((s) => {
      const nova = new Set(s);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  async function buscarDadosEtiqueta(ordemServicoId: number): Promise<DadosEtiquetaDespacho | null> {
    const os = porId(ordemServicoId);
    if (!os) return null;
    const { data: cliente, error } = await supabase
      .from('clientes')
      .select('razao_social, logradouro, numero_endereco, complemento, bairro, cidade, uf, cep')
      .eq('id', os.cliente_id)
      .single();
    if (error) {
      alert(mensagemErro(error));
      return null;
    }
    let clienteFinalNome: string | null = null;
    const { data: osCompleta } = await supabase
      .from('ordens_servico')
      .select('cliente_final_id')
      .eq('id', ordemServicoId)
      .single();
    if (osCompleta?.cliente_final_id) {
      const { data: clienteFinal } = await supabase
        .from('clientes')
        .select('razao_social')
        .eq('id', osCompleta.cliente_final_id)
        .single();
      clienteFinalNome = clienteFinal?.razao_social ?? null;
    }
    return {
      numeroOS: os.numero_os,
      clienteNome: cliente.razao_social,
      clienteFinalNome,
      logradouro: cliente.logradouro,
      numeroEndereco: cliente.numero_endereco,
      complemento: cliente.complemento,
      bairro: cliente.bairro,
      cidade: cliente.cidade,
      uf: cliente.uf,
      cep: cliente.cep,
      equipamento: os.optica_desc,
    };
  }

  // Marca a etiqueta como impressa - assim que isso acontece, a OS sai da
  // lista de pendentes de impressão (opcoesParaImprimir acima).
  async function marcarEtiquetaImpressa(ordemServicoIds: number[]) {
    if (ordemServicoIds.length === 0) return;
    await supabase
      .from('ordens_servico')
      .update({ etiqueta_despacho_impressa_em: new Date().toISOString() })
      .in('id', ordemServicoIds);
    qc.invalidateQueries({ queryKey: ['ordens-servico-opcoes'] });
  }

  async function imprimirEtiqueta(ordemServicoId: number) {
    const dados = await buscarDadosEtiqueta(ordemServicoId);
    if (dados) {
      imprimirEtiquetaDespacho(dados);
      await marcarEtiquetaImpressa([ordemServicoId]);
    }
  }

  // Imprime de uma vez a etiqueta só das OS marcadas no painel de seleção
  // (abaixo), 4 por folha A4 - pra usar numa impressora comum enquanto a
  // térmica não está disponível, sem precisar clicar OS por OS.
  async function imprimirEtiquetasLote() {
    setImprimindoLote(true);
    try {
      const ids = Array.from(osSelecionadas);
      const lista = (await Promise.all(ids.map((id) => buscarDadosEtiqueta(id)))).filter(
        (d): d is DadosEtiquetaDespacho => d != null,
      );
      imprimirEtiquetasDespachoLote(lista);
      await marcarEtiquetaImpressa(ids);
      setOsSelecionadas(new Set());
    } finally {
      setImprimindoLote(false);
    }
  }

  // Quando o cliente não confirma o recebimento pelo portal (esquece, não
  // tem acesso, etc.), a equipe pode dar baixa manual - fica registrado
  // separado da confirmação eletrônica (quem/quando), pra não parecer que
  // foi o próprio cliente que confirmou.
  async function finalizarManualmente(row: EntregaRow) {
    if (!confirm('Confirma que o equipamento foi entregue e o cliente não vai confirmar pelo portal? Isso finaliza a entrega manualmente.'))
      return;
    const { error } = await supabase
      .from('entregas')
      .update({
        finalizado_manualmente_em: new Date().toISOString(),
        finalizado_manualmente_por: funcionario?.id ?? null,
      })
      .eq('id', row.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['entregas'] });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <button
          className="botao-secundario"
          onClick={() => setSelecionandoEtiquetas((v) => !v)}
          disabled={opcoesParaImprimir.length === 0}
        >
          Selecionar etiquetas para imprimir{osSelecionadas.size > 0 ? ` (${osSelecionadas.size})` : ''}
        </button>
        <button className="botao-secundario" onClick={imprimirOrientacaoEsterilizacao}>
          Orientação de esterilização (PDF)
        </button>
        <button
          className="botao-secundario"
          onClick={() => setSelecionandoRastreio((v) => !v)}
          disabled={entregasSemRastreio.length === 0}
        >
          Selecionar entregas para enviar rastreio{entregasSelecionadasRastreio.size > 0 ? ` (${entregasSelecionadasRastreio.size})` : ''}
        </button>
      </div>

      {selecionandoRastreio && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            background: 'var(--paper-50)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>
              Entregas sem rastreio - marque as do MESMO cliente que vão no mesmo pacote/código
            </strong>
            <button className="botao-secundario botao-pequeno" onClick={() => setEntregasSelecionadasRastreio(new Set())}>
              Limpar seleção
            </button>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {entregasSemRastreio.map((e) => {
              const os = porId(e.ordem_servico_id);
              const orc = orcamentoPorOS(e.ordem_servico_id);
              return (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={entregasSelecionadasRastreio.has(e.id)}
                    onChange={() => alternarSelecaoEntregaRastreio(e.id)}
                  />
                  {os?.numero_os ?? `OS #${e.ordem_servico_id}`} - {os?.cliente_nome ?? '-'}
                  {orc ? ` - ${orc.numero}` : ''}
                </label>
              );
            })}
            {entregasSemRastreio.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Nenhuma entrega pendente de rastreio no momento.</p>
            )}
          </div>
          {entregasSelecionadasRastreio.size > 0 &&
            clienteComumDas(entregasSemRastreio.filter((e) => entregasSelecionadasRastreio.has(e.id))) == null && (
              <p style={{ fontSize: 12, color: 'var(--danger-500)', marginTop: 8 }}>
                As entregas marcadas são de clientes diferentes - selecione só entregas do mesmo cliente.
              </p>
            )}
          <button
            className="botao-primario botao-pequeno"
            style={{ marginTop: 10 }}
            onClick={continuarSelecaoRastreio}
            disabled={
              entregasSelecionadasRastreio.size === 0 ||
              clienteComumDas(entregasSemRastreio.filter((e) => entregasSelecionadasRastreio.has(e.id))) == null
            }
          >
            Continuar ({entregasSelecionadasRastreio.size})
          </button>
        </div>
      )}

      {selecionandoEtiquetas && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            background: 'var(--paper-50)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>OS liberadas para entrega - marque as que quer imprimir</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="botao-secundario botao-pequeno"
                onClick={() => setOsSelecionadas(new Set(opcoesParaImprimir.map((o) => Number(o.value))))}
              >
                Selecionar todas
              </button>
              <button className="botao-secundario botao-pequeno" onClick={() => setOsSelecionadas(new Set())}>
                Limpar seleção
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {opcoesParaImprimir.map((o) => (
              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={osSelecionadas.has(Number(o.value))}
                  onChange={() => alternarSelecaoOS(Number(o.value))}
                />
                {o.label}
              </label>
            ))}
            {opcoesParaImprimir.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Nenhuma OS liberada para entrega no momento.</p>
            )}
          </div>
          <button
            className="botao-primario botao-pequeno"
            style={{ marginTop: 10 }}
            onClick={imprimirEtiquetasLote}
            disabled={imprimindoLote || osSelecionadas.size === 0}
          >
            {imprimindoLote
              ? 'Gerando...'
              : `Imprimir ${osSelecionadas.size} etiqueta${osSelecionadas.size === 1 ? '' : 's'} (4 por folha)`}
          </button>
        </div>
      )}
      <CrudPage<EntregaRow>
      titulo="Entrega ao cliente"
      tabela="entregas"
      ordenarPor="id"
      camposFiltro={[
        (r) => porId(r.ordem_servico_id)?.numero_os ?? '',
        (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '',
        'forma_devolucao',
        'nf_devolucao_numero',
      ]}
      colunas={[
        {
          chave: 'entrada',
          label: 'Entrada',
          render: (r) => (
            <span className="link-numero mono" onClick={() => navigate(`/registro-entrada?os=${r.ordem_servico_id}`)}>
              {codigoEntradaPorOS.get(r.ordem_servico_id) ?? '-'}
            </span>
          ),
          valorFiltro: (r) => codigoEntradaPorOS.get(r.ordem_servico_id) ?? '-',
        },
        {
          chave: 'ordem_servico_id',
          label: 'OS',
          render: (r) => (
            <span className="link-numero mono" onClick={() => navigate(`/orcamento-tecnico?os=${r.ordem_servico_id}`)}>
              {porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`}
            </span>
          ),
          valorFiltro: (r) => porId(r.ordem_servico_id)?.numero_os ?? r.ordem_servico_id,
        },
        {
          chave: 'orcamento',
          label: 'Orçamento',
          render: (r) => {
            const orc = orcamentoPorOS(r.ordem_servico_id);
            return orc ? (
              <span
                className="link-numero mono"
                onClick={() => navigate(`/orcamento-tecnico?os=${r.ordem_servico_id}&orcamento=${orc.id}`)}
              >
                {orc.numero}
              </span>
            ) : (
              <span className="mono" style={{ color: 'var(--ink-400)' }}>
                -
              </span>
            );
          },
          valorFiltro: (r) => orcamentoPorOS(r.ordem_servico_id)?.numero ?? '-',
        },
        {
          chave: 'cliente',
          label: 'Cliente',
          render: (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '-',
          valorFiltro: (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '-',
        },
        {
          chave: 'equipamento',
          label: 'Equipamento',
          render: (r) =>
            [porId(r.ordem_servico_id)?.optica_desc, porId(r.ordem_servico_id)?.optica_fab].filter(Boolean).join(' - ') || '-',
          valorFiltro: (r) =>
            [porId(r.ordem_servico_id)?.optica_desc, porId(r.ordem_servico_id)?.optica_fab].filter(Boolean).join(' - ') || '-',
        },
        {
          chave: 'situacao',
          label: 'Situação',
          render: (r) =>
            porId(r.ordem_servico_id)?.status_os === STATUS_DEVOLUCAO_SEM_REPARO ? (
              <Badge tono="danger">Devolução sem reparo</Badge>
            ) : (
              <Badge tono="teal">Pós-reparo</Badge>
            ),
          valorFiltro: (r) =>
            porId(r.ordem_servico_id)?.status_os === STATUS_DEVOLUCAO_SEM_REPARO ? 'Devolução sem reparo' : 'Pós-reparo',
        },
        { chave: 'forma_devolucao', label: 'Forma de devolução' },
        { chave: 'codigo_rastreio', label: 'Rastreio', render: (r) => r.codigo_rastreio || '-', mono: true },
        { chave: 'nf_devolucao_numero', label: 'NF devolução', mono: true },
        { chave: 'data_entrega', label: 'Data', render: (r) => (r.data_entrega ? new Date(r.data_entrega).toLocaleString('pt-BR') : '-') },
        {
          chave: 'confirmado_pelo_cliente_em',
          label: 'Confirmado pelo cliente',
          render: (r) =>
            r.confirmado_pelo_cliente_em ? (
              <Badge tono="teal">{new Date(r.confirmado_pelo_cliente_em).toLocaleString('pt-BR')}</Badge>
            ) : r.finalizado_manualmente_em ? (
              <Badge tono="copper">Finalizado manualmente {new Date(r.finalizado_manualmente_em).toLocaleString('pt-BR')}</Badge>
            ) : (
              <Badge tono="neutro">Aguardando</Badge>
            ),
          rotuloFiltro: (r) =>
            r.confirmado_pelo_cliente_em
              ? new Date(r.confirmado_pelo_cliente_em).toLocaleString('pt-BR')
              : r.finalizado_manualmente_em
                ? `Finalizado manualmente ${new Date(r.finalizado_manualmente_em).toLocaleString('pt-BR')}`
                : 'Aguardando',
        },
        { chave: 'detalhes', label: 'Detalhes' },
      ]}
      acoesExtras={(row) => (
        <>
          <button
            className="botao-icone"
            title="Imprimir etiqueta de despacho"
            onClick={() => imprimirEtiqueta(row.ordem_servico_id)}
          >
            <IconPrinter size={16} />
          </button>
          <button
            className="botao-icone"
            title={row.codigo_rastreio ? 'Editar código de rastreio' : 'Adicionar código de rastreio'}
            onClick={() => abrirEdicaoRastreio([{ id: row.id, ordem_servico_id: row.ordem_servico_id, codigo_rastreio: row.codigo_rastreio }])}
          >
            <IconTruckDelivery size={16} />
          </button>
          {row.codigo_rastreio && (
            <button
              className="botao-secundario botao-pequeno"
              title="Enviar o código de rastreio por e-mail pro cliente"
              onClick={() => enviarRastreioPorEmail(row)}
            >
              Enviar rastreio
            </button>
          )}
          {!row.confirmado_pelo_cliente_em && !row.finalizado_manualmente_em && (
            <button
              className="botao-secundario botao-pequeno"
              title="Dar baixa manual quando o cliente não confirma pelo portal"
              onClick={() => finalizarManualmente(row)}
            >
              Finalizar
            </button>
          )}
        </>
      )}
      acoesFormularioExtras={(formData) => {
        const osId = formData.ordem_servico_id ? Number(formData.ordem_servico_id) : null;
        if (!osId) return null;
        return (
          <button
            type="button"
            className="botao-secundario"
            title="Imprime a etiqueta antes de salvar - depois de salvar, esta OS sai da lista de pendentes de etiqueta"
            onClick={() => imprimirEtiqueta(osId)}
          >
            <IconPrinter size={16} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
            Imprimir etiqueta
          </button>
        );
      }}
      campos={[
        { name: 'ordem_servico_id', label: 'Ordem de serviço (só liberadas p/ entrega)', type: 'combobox', opcoes: opcoesEntrega, obrigatorio: true },
        {
          name: 'forma_devolucao',
          label: 'Forma de devolução',
          type: 'select',
          opcoes: ['Carro próprio', 'Correios', 'Transportadora'],
          obrigatorio: true,
        },
        { name: 'detalhes', label: 'Detalhes (transportadora, etc.)', type: 'textarea' },
        { name: 'codigo_rastreio', label: 'Código de rastreio (Correios)', type: 'text' },
        { name: 'nf_devolucao_numero', label: 'Nota fiscal de devolução - número', type: 'text' },
        { name: 'nf_devolucao_serie', label: 'Nota fiscal de devolução - série', type: 'text' },
        { name: 'nf_devolucao_cfop', label: 'CFOP (5916/6916)', type: 'text' },
        { name: 'nf_devolucao_chave_acesso', label: 'Chave de acesso', type: 'text' },
        { name: 'nf_devolucao_data_emissao', label: 'Data de emissão da NF', type: 'date' },
        { name: 'nf_devolucao_valor', label: 'Valor da NF (R$)', type: 'number' },
      ]}
      validar={(d) => {
        if (!d.ordem_servico_id) return 'Selecione a ordem de serviço.';
        // Editando uma entrega já existente (tem id) - não reexige a
        // porteira "liberada pra entrega", já que o status naturalmente
        // avança pra "Entregue" assim que a entrega é criada pela 1ª vez.
        const editando = !!d.id;
        if (!editando && !podeEntregar(Number(d.ordem_servico_id)))
          return 'Esta OS ainda não está liberada para entrega (precisa estar em "Pronto para entrega" ou "Devolução sem reparo").';
        if (!d.forma_devolucao) return 'Selecione a forma de devolução.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        ordem_servico_id: Number(d.ordem_servico_id),
        nf_devolucao_valor: d.nf_devolucao_valor ? Number(d.nf_devolucao_valor) : null,
        // Chave de acesso da NF-e tem exatamente 44 dígitos - cola-se com
        // espaços/pontos como formatação de leitura (ex: "3526 0846 ...")
        // mas o campo no banco só aceita os 44 caracteres puros.
        nf_devolucao_chave_acesso: d.nf_devolucao_chave_acesso
          ? String(d.nf_devolucao_chave_acesso).replace(/\D/g, '')
          : d.nf_devolucao_chave_acesso,
      })}
      aposSalvar={async (dados) => {
        await supabase
          .from('ordens_servico')
          .update({ status_os: '11. ENTREGUE AO CLIENTE' })
          .eq('id', dados.ordem_servico_id as number);
        // A lista de "OS liberadas para entrega" (useOrdensServicoOpcoes) tem
        // seu próprio cache separado - sem isso, a OS recém-entregue continua
        // aparecendo como selecionável até a página ser recarregada.
        qc.invalidateQueries({ queryKey: ['ordens-servico-opcoes'] });
      }}
      ocultarPorPadrao={{
        linhaOculta: (r) => !!r.confirmado_pelo_cliente_em || !!r.finalizado_manualmente_em,
        rotulo: 'já finalizadas',
      }}
    />

    {linhasEditandoRastreio && (
      <ModalJanela titulo="Código de rastreio (Correios)" aoFechar={() => setLinhasEditandoRastreio(null)}>
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
          Orçamento{linhasEditandoRastreio.length > 1 ? 's' : ''} nesse envio: {numerosOrcamentoTexto(linhasEditandoRastreio)}
        </p>

        <div className="campo-form">
          <label>Código de rastreio</label>
          <input
            type="text"
            value={novoCodigoRastreio}
            onChange={(e) => setNovoCodigoRastreio(e.target.value)}
            autoFocus
          />
        </div>

        <div className="campo-form">
          <label>Etiqueta em PDF (opcional, anexada no e-mail automático)</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setArquivoEtiqueta(e.target.files?.[0] ?? null)}
          />
          {arquivoEtiqueta && (
            <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>Selecionado: {arquivoEtiqueta.name}</p>
          )}
        </div>

        {enviadoAutomatico && <p style={{ fontSize: 13, color: 'var(--teal-600, #0d7d6f)' }}>E-mail enviado com sucesso!</p>}
        {erroRastreio && <p className="erro-login">{erroRastreio}</p>}

        <div className="modal-acoes">
          <button className="botao-secundario" onClick={() => setLinhasEditandoRastreio(null)} disabled={salvandoRastreio || enviandoAutomatico}>
            Cancelar
          </button>
          <button className="botao-secundario" onClick={salvarRastreio} disabled={salvandoRastreio || enviandoAutomatico}>
            {salvandoRastreio ? 'Salvando...' : 'Só salvar'}
          </button>
          <button className="botao-primario" onClick={enviarRastreioAutomatico} disabled={salvandoRastreio || enviandoAutomatico}>
            {enviandoAutomatico ? 'Enviando...' : 'Salvar e enviar por e-mail'}
          </button>
        </div>
      </ModalJanela>
    )}
    </div>
  );
}
