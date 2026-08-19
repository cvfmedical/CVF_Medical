import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';

interface TipoEquipamentoLaudo {
  id: number;
  descricao: string;
  status_ativo: boolean;
}

export function TiposEquipamentoLaudo() {
  return (
    <CrudPage<TipoEquipamentoLaudo>
      titulo="Tipos de equipamento (laudo)"
      tabela="tipos_equipamento_laudo"
      ordenarPor="descricao"
      camposFiltro={['descricao']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'descricao', label: 'Descrição' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
          rotuloFiltro: (r) => (r.status_ativo ? 'Ativo' : 'Inativo'),
        },
      ]}
      campos={[
        { name: 'descricao', label: 'Descrição (ex: Console/fonte de luz, Bisturi elétrico)', type: 'text', obrigatorio: true },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => (!d.descricao ? 'Informe a descrição.' : null)}
    />
  );
}
