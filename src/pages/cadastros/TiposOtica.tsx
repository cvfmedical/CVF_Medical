import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';

interface TipoOtica {
  id: number;
  descricao: string;
  status_ativo: boolean;
}

export function TiposOtica() {
  return (
    <CrudPage<TipoOtica>
      titulo="Tipos de ótica"
      tabela="tipos_otica"
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
        { name: 'descricao', label: 'Descrição', type: 'text', obrigatorio: true },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => (!d.descricao ? 'Informe a descrição.' : null)}
    />
  );
}
