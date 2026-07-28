import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { supabase } from '../../lib/supabaseClient';

interface EntregaRow {
  id: number;
  ordem_servico_id: number;
  forma_devolucao: string;
  detalhes: string | null;
  data_entrega: string | null;
}

export function Entrega() {
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  if (isLoading) return <CarregandoTela />;

  return (
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
        { chave: 'forma_devolucao', label: 'Forma de devolução' },
        { chave: 'data_entrega', label: 'Data', render: (r) => (r.data_entrega ? new Date(r.data_entrega).toLocaleString('pt-BR') : '-') },
        { chave: 'detalhes', label: 'Detalhes' },
      ]}
      campos={[
        { name: 'ordem_servico_id', label: 'Ordem de serviço', type: 'select', opcoes, obrigatorio: true },
        {
          name: 'forma_devolucao',
          label: 'Forma de devolução',
          type: 'select',
          opcoes: ['Carro próprio', 'Correios', 'Transportadora'],
          obrigatorio: true,
        },
        { name: 'detalhes', label: 'Detalhes (transportadora, rastreio, etc.)', type: 'textarea' },
      ]}
      validar={(d) => {
        if (!d.ordem_servico_id) return 'Selecione a ordem de serviço.';
        if (!d.forma_devolucao) return 'Selecione a forma de devolução.';
        return null;
      }}
      antesDeEnviar={(d) => ({ ...d, ordem_servico_id: Number(d.ordem_servico_id) })}
      aposSalvar={async (dados) => {
        await supabase
          .from('ordens_servico')
          .update({ status_os: '11. ENTREGUE AO CLIENTE' })
          .eq('id', dados.ordem_servico_id as number);
      }}
    />
  );
}
