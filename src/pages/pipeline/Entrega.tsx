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
import { useQueryClient } from '@tanstack/react-query';

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
}

export function Entrega() {
  const qc = useQueryClient();
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  const [imprimindoLote, setImprimindoLote] = useState(false);
  const [selecionandoEtiquetas, setSelecionandoEtiquetas] = useState(false);
  const [osSelecionadas, setOsSelecionadas] = useState<Set<number>>(new Set());
  if (isLoading) return <CarregandoTela />;

  // Porteira: só entra na entrega quem terminou o fluxo ("Pronto para entrega")
  // ou saiu por devolução sem reparo (orçamento recusado).
  const podeEntregar = (osId: number) => {
    const s = porId(osId)?.status_os;
    return s === STATUS_PRONTO_ENTREGA || s === STATUS_DEVOLUCAO_SEM_REPARO;
  };
  const opcoesEntrega = opcoes.filter((o) => podeEntregar(Number(o.value)));

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

  async function imprimirEtiqueta(ordemServicoId: number) {
    const dados = await buscarDadosEtiqueta(ordemServicoId);
    if (dados) imprimirEtiquetaDespacho(dados);
  }

  // Imprime de uma vez a etiqueta só das OS marcadas no painel de seleção
  // (abaixo), 4 por folha A4 - pra usar numa impressora comum enquanto a
  // térmica não está disponível, sem precisar clicar OS por OS.
  async function imprimirEtiquetasLote() {
    setImprimindoLote(true);
    try {
      const lista = (
        await Promise.all(Array.from(osSelecionadas).map((id) => buscarDadosEtiqueta(id)))
      ).filter((d): d is DadosEtiquetaDespacho => d != null);
      imprimirEtiquetasDespachoLote(lista);
    } finally {
      setImprimindoLote(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <button
          className="botao-secundario"
          onClick={() => setSelecionandoEtiquetas((v) => !v)}
          disabled={opcoesEntrega.length === 0}
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
                onClick={() => setOsSelecionadas(new Set(opcoesEntrega.map((o) => Number(o.value))))}
              >
                Selecionar todas
              </button>
              <button className="botao-secundario botao-pequeno" onClick={() => setOsSelecionadas(new Set())}>
                Limpar seleção
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {opcoesEntrega.map((o) => (
              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={osSelecionadas.has(Number(o.value))}
                  onChange={() => alternarSelecaoOS(Number(o.value))}
                />
                {o.label}
              </label>
            ))}
            {opcoesEntrega.length === 0 && (
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
          mono: true,
          render: (r) => porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`,
        },
        {
          chave: 'cliente',
          label: 'Cliente',
          render: (r) => porId(r.ordem_servico_id)?.cliente_nome ?? '-',
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
            ) : (
              <Badge tono="neutro">Aguardando</Badge>
            ),
        },
        { chave: 'detalhes', label: 'Detalhes' },
      ]}
      acoesExtras={(row) => (
        <button
          className="botao-icone"
          title="Imprimir etiqueta de despacho"
          onClick={() => imprimirEtiqueta(row.ordem_servico_id)}
        >
          <IconPrinter size={16} />
        </button>
      )}
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
        if (!podeEntregar(Number(d.ordem_servico_id)))
          return 'Esta OS ainda não está liberada para entrega (precisa estar em "Pronto para entrega" ou "Devolução sem reparo").';
        if (!d.forma_devolucao) return 'Selecione a forma de devolução.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        ordem_servico_id: Number(d.ordem_servico_id),
        nf_devolucao_valor: d.nf_devolucao_valor ? Number(d.nf_devolucao_valor) : null,
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
