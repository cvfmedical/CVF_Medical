import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';
import { CarregandoTela } from '../../components/CarregandoTela';

interface ProdutoServico {
  id: number;
  codigo: string | null;
  nome: string;
  tipo: string | null;
  descricao: string | null;
  categoria: string | null;
  ncm: string | null;
  marca_fabricante: string | null;
  fornecedor_id: number | null;
  preco_custo: number | null;
  preco_unitario: number | null;
  unidade: string;
  codigo_barras: string | null;
  observacoes: string | null;
  status_ativo: boolean;
}

export function ProdutosServicos() {
  const fornecedoresQuery = useQuery({
    queryKey: ['fornecedores-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  if (fornecedoresQuery.isLoading) return <CarregandoTela />;

  const opcoesFornecedor = (fornecedoresQuery.data ?? []).map((f) => ({ value: String(f.id), label: f.razao_social }));
  const nomeFornecedor = (id: number | null) =>
    id ? fornecedoresQuery.data?.find((f) => f.id === id)?.razao_social ?? `#${id}` : '-';

  return (
    <CrudPage<ProdutoServico>
      titulo="Produtos e serviços"
      tabela="produtos_servicos"
      ordenarPor="nome"
      camposFiltro={['nome', 'categoria', 'codigo', 'codigo_barras']}
      valorInicial={{ status_ativo: true, unidade: 'un', tipo: 'Peça' }}
      colunas={[
        { chave: 'codigo', label: 'Código', mono: true },
        { chave: 'nome', label: 'Nome' },
        { chave: 'tipo', label: 'Tipo' },
        { chave: 'categoria', label: 'Categoria' },
        { chave: 'marca_fabricante', label: 'Marca/fabricante' },
        {
          chave: 'preco_custo',
          label: 'Preço de custo',
          render: (r) => (r.preco_custo != null ? `R$ ${Number(r.preco_custo).toFixed(2)}` : '-'),
        },
        {
          chave: 'preco_unitario',
          label: 'Preço de venda',
          render: (r) => (r.preco_unitario != null ? `R$ ${Number(r.preco_unitario).toFixed(2)}` : '-'),
        },
        { chave: 'unidade', label: 'Unidade' },
        { chave: 'fornecedor_id', label: 'Fornecedor', render: (r) => nomeFornecedor(r.fornecedor_id) },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
        },
      ]}
      campos={[
        { name: 'codigo', label: 'Código interno (SKU)', type: 'text' },
        { name: 'nome', label: 'Nome', type: 'text', obrigatorio: true },
        { name: 'tipo', label: 'Tipo', type: 'select', opcoes: ['Produto', 'Peça', 'Serviço'], obrigatorio: true },
        { name: 'descricao', label: 'Descrição', type: 'textarea' },
        { name: 'categoria', label: 'Categoria', type: 'text' },
        { name: 'marca_fabricante', label: 'Marca/fabricante', type: 'text' },
        { name: 'fornecedor_id', label: 'Fornecedor padrão', type: 'select', opcoes: opcoesFornecedor },
        { name: 'ncm', label: 'NCM (para nota fiscal)', type: 'text' },
        { name: 'codigo_barras', label: 'Código de barras', type: 'text' },
        { name: 'preco_custo', label: 'Preço de custo (R$)', type: 'number' },
        { name: 'preco_unitario', label: 'Preço de venda (R$)', type: 'number' },
        { name: 'unidade', label: 'Unidade', type: 'text' },
        { name: 'observacoes', label: 'Observações', type: 'textarea' },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => {
        if (!d.nome) return 'Informe o nome.';
        if (!d.tipo) return 'Selecione o tipo.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        preco_unitario: d.preco_unitario ? Number(d.preco_unitario) : null,
        preco_custo: d.preco_custo ? Number(d.preco_custo) : null,
        fornecedor_id: d.fornecedor_id ? Number(d.fornecedor_id) : null,
      })}
    />
  );
}
