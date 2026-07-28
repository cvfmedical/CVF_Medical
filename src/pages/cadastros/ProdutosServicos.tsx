import { CrudPage } from '../../components/CrudPage';

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
      titulo="Produtos e Serviços"
      tabela="produtos_servicos"
      ordenarPor="nome"
      camposFiltro={['nome', 'categoria']}
      valorInicial={{ status_ativo: true, unidade: 'un' }}
      colunas={[
        { chave: 'nome', label: 'Nome' },
        { chave: 'categoria', label: 'Categoria' },
        {
          chave: 'preco_unitario',
          label: 'Preço Unitário',
          render: (r) => (r.preco_unitario != null ? `R$ ${Number(r.preco_unitario).toFixed(2)}` : '-'),
        },
        { chave: 'unidade', label: 'Unidade' },
        { chave: 'status_ativo', label: 'Ativo', render: (r) => (r.status_ativo ? 'Sim' : 'Não') },
      ]}
      campos={[
        { name: 'nome', label: 'Nome', type: 'text', obrigatorio: true },
        { name: 'descricao', label: 'Descrição', type: 'textarea' },
        { name: 'categoria', label: 'Categoria', type: 'text' },
        { name: 'preco_unitario', label: 'Preço Unitário (R$)', type: 'number' },
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
