import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { STATUS_DEVOLUCAO_SEM_REPARO, STATUS_PRONTO_ENTREGA } from '../../lib/statusOS';
import { imprimirOrientacaoEsterilizacao } from '../../lib/orientacaoEsterilizacao';

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
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  if (isLoading) return <CarregandoTela />;

  // Porteira: só entra na entrega quem terminou o fluxo ("Pronto para entrega")
  // ou saiu por devolução sem reparo (orçamento recusado).
  const podeEntregar = (osId: number) => {
    const s = porId(osId)?.status_os;
    return s === STATUS_PRONTO_ENTREGA || s === STATUS_DEVOLUCAO_SEM_REPARO;
  };
  const opcoesEntrega = opcoes.filter((o) => podeEntregar(Number(o.value)));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="botao-secundario" onClick={imprimirOrientacaoEsterilizacao}>
          Orientação de esterilização (PDF)
        </button>
      </div>
      <CrudPage<EntregaRow>
      titulo="Entrega ao cliente"
      tabela="entregas"
      ordenarPor="id"
      colunas={[
        {
          chave: 'ordem_servico_id',
          label: 'OS',
          mono: true,
          render: (r) => porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`,
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
      campos={[
        { name: 'ordem_servico_id', label: 'Ordem de serviço (só liberadas p/ entrega)', type: 'select', opcoes: opcoesEntrega, obrigatorio: true },
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
      }}
    />
    </div>
  );
}
