import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';

interface Categoria {
  id: number;
  descricao: string;
  status_ativo: boolean;
}

export function CategoriasProdutosServicos() {
  return (
    <CrudPage<Categoria>
      titulo="Grupos de produtos e serviços"
      tabela="categorias_produtos_servicos"
      ordenarPor="descricao"
      camposFiltro={['descricao']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'descricao', label: 'Descrição' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
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
