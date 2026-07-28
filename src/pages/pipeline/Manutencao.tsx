import { CrudPage } from '../../components/CrudPage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';

interface Manutencao {
  id: number;
  ordem_servico_id: number;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
}

export function Manutencao() {
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  if (isLoading) return <CarregandoTela />;

  return (
    <CrudPage<Manutencao>
      titulo="Manutenção / remontagem"
      tabela="manutencoes"
      ordenarPor="id"
      colunas={[
        {
          chave: 'ordem_servico_id',
          label: 'OS',
          mono: true,
          render: (r) => porId(r.ordem_servico_id)?.numero_os ?? `#${r.ordem_servico_id}`,
        },
        { chave: 'data_inicio', label: 'Início', render: (r) => (r.data_inicio ? new Date(r.data_inicio).toLocaleString('pt-BR') : '-') },
        { chave: 'data_fim', label: 'Fim', render: (r) => (r.data_fim ? new Date(r.data_fim).toLocaleString('pt-BR') : '-') },
        { chave: 'observacoes', label: 'Observações' },
      ]}
      campos={[
        { name: 'ordem_servico_id', label: 'Ordem de serviço', type: 'select', opcoes, obrigatorio: true },
        { name: 'data_inicio', label: 'Data de início', type: 'date' },
        { name: 'data_fim', label: 'Data de fim (deixe em branco se ainda em andamento)', type: 'date' },
        { name: 'observacoes', label: 'Checklist / peças trocadas / observações', type: 'textarea' },
      ]}
      validar={(d) => (!d.ordem_servico_id ? 'Selecione a ordem de serviço.' : null)}
      antesDeEnviar={(d) => ({ ...d, ordem_servico_id: Number(d.ordem_servico_id) })}
    />
  );
}
