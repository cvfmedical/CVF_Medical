import { useNavigate } from 'react-router-dom';
import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { STATUS_DEVOLUCAO_SEM_REPARO, STATUS_PRONTO_ENTREGA } from '../../lib/statusOS';
import { imprimirOrientacaoEsterilizacao } from '../../lib/orientacaoEsterilizacao';
import { imprimirEtiquetaDespacho, imprimirEtiquetasDespachoLote, type DadosEtiquetaDespacho } from '../../lib/etiquetaDespacho';
import { IconPrinter } from '@tabler/icons-react';
import { mensagemErro } from '../../lib/erros';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';

interface EntregaRow {
  id: number;
  ordem_servico_id: number;
  forma_devolucao: string;
  detalhes: string | null;
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
  const [imprimindoLote, setImprimindoLote] = useState(false);
  const [selecionandoEtiquetas, setSelecionandoEtiquetas] = useState(false);
  const [osSelecionadas, setOsSelecionadas] = useState<Set<number>>(new Set());

  // Nº do orçamento de cada OS - pra saber a que orçamento essa entrega se
  // refere, sem precisar abrir a OS. Pega o mais recente quando a OS tem
  // mais de um orçamento (reversão de precificação etc.).
  const orcamentosQuery = useQuery({
    queryKey: ['orcamentos-numero-por-os'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('id, numero_orcamento, ordem_servico_id')
        .order('id', { ascending: false });
      if (error) throw error;
      return data as { id: number; numero_orcamento: string; ordem_servico_id: number }[];
    },
  });
  function orcamentoPorOS(osId: number): { id: number; numero: string } | null {
    const o = orcamentosQuery.data?.find((o) => o.ordem_servico_id === osId);
    return o ? { id: o.id, numero: o.numero_orcamento } : null;
  }

  // OS's que já têm entrega registrada - precisam continuar selecionáveis
  // no combobox e passar na validação ao EDITAR essa entrega, mesmo que o
  // status já tenha avançado pra "Entregue" (efeito esperado de já ter
  // sido entregue antes). Sem isso, editar uma entrega já salva mostrava
  // o campo "Ordem de serviço" em branco e travava com "OS não liberada".
  const entregasExistentesQuery = useQuery({
    queryKey: ['entregas-os-ids'],
    queryFn: async () => {
      const { data, error } = await supabase.from('entregas').select('ordem_servico_id');
      if (error) throw error;
      return data as { ordem_servico_id: number }[];
    },
  });

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
      </div>

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
        { name: 'detalhes', label: 'Detalhes (transportadora, rastreio, etc.)', type: 'textarea' },
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
    />
    </div>
  );
}
