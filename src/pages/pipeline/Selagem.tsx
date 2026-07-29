import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { supabase } from '../../lib/supabaseClient';

interface SelagemRow {
  id: number;
  ordem_servico_id: number;
  data_selagem: string | null;
  tipo_cola: string | null;
  tempo_cura_horas: number | null;
}

export function Selagem() {
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  if (isLoading) return <CarregandoTela />;

  return (
    <CrudPage<SelagemRow>
      titulo="Selagem"
      tabela="selagens"
      ordenarPor="id"
      colunas={[
        {
          chave: 'ordem_servico_id',
          label: 'OS',
          mono: true,
          render: (r) => porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`,
        },
        { chave: 'tipo_cola', label: 'Tipo de cola' },
        { chave: 'tempo_cura_horas', label: 'Cura (horas)' },
        { chave: 'data_selagem', label: 'Data da selagem', render: (r) => (r.data_selagem ? new Date(r.data_selagem).toLocaleString('pt-BR') : '-') },
      ]}
      campos={[
        { name: 'ordem_servico_id', label: 'Ordem de serviço', type: 'select', opcoes, obrigatorio: true },
        { name: 'tipo_cola', label: 'Tipo de cola', type: 'text' },
        { name: 'tempo_cura_horas', label: 'Tempo de cura (horas)', type: 'number' },
      ]}
      validar={(d) => (!d.ordem_servico_id ? 'Selecione a ordem de serviço.' : null)}
      antesDeEnviar={(d) => ({
        ...d,
        ordem_servico_id: Number(d.ordem_servico_id),
        tempo_cura_horas: d.tempo_cura_horas ? Number(d.tempo_cura_horas) : null,
      })}
      aposSalvar={async (dados) => {
        // Selagem registrada = cura em andamento/concluída - avança para
        // o teste de estanqueidade automaticamente.
        await supabase
          .from('ordens_servico')
          .update({ status_os: '7. TESTE DE ESTANQUEIDADE' })
          .eq('id', dados.ordem_servico_id as number);
      }}
    />
  );
}
