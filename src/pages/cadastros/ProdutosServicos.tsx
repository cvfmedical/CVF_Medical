import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';

interface ProdutoServico {
  id: number;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  preco_unitario: number | null;
  unidade: string;
  status_ativo: boolean;
}

export function ProdutosServicos() {
  return (
    <CrudPage<ProdutoServico>
      titulo="Produtos e serviços"
      tabela="produtos_servicos"
      ordenarPor="nome"
      camposFiltro={['nome', 'categoria']}
      valorInicial={{ status_ativo: true, unidade: 'un' }}
      colunas={[
        { chave: 'nome', label: 'Nome' },
        { chave: 'categoria', label: 'Categoria' },
        {
          chave: 'preco_unitario',
          label: 'Preço unitário',
          render: (r) => (r.preco_unitario != null ? `R$ ${Number(r.preco_unitario).toFixed(2)}` : '-'),
        },
        { chave: 'unidade', label: 'Unidade' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
        },
      ]}
      campos={[
        { name: 'nome', label: 'Nome', type: 'text', obrigatorio: true },
        { name: 'descricao', label: 'Descrição', type: 'textarea' },
        { name: 'categoria', label: 'Categoria', type: 'text' },
        { name: 'preco_unitario', label: 'Preço unitário (R$)', type: 'number' },
        { name: 'unidade', label: 'Unidade', type: 'text' },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => (!d.nome ? 'Informe o nome.' : null)}
      antesDeEnviar={(d) => ({
        ...d,
        preco_unitario: d.preco_unitario ? Number(d.preco_unitario) : null,
      })}
    />
  );
}
