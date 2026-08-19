import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';

interface Subgrupo {
  id: number;
  grupo: string;
  descricao: string;
  status_ativo: boolean;
}

export function SubgruposProdutosServicos() {
  const gruposQuery = useQuery({
    queryKey: ['grupos-produtos-servicos-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_produtos_servicos')
        .select('descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { descricao: string }[];
    },
  });

  return (
    <CrudPage<Subgrupo>
      titulo="Subgrupos de produtos e serviços"
      tabela="subgrupos"
      ordenarPor="descricao"
      camposFiltro={['descricao', 'grupo']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'grupo', label: 'Grupo' },
        { chave: 'descricao', label: 'Subgrupo' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
          rotuloFiltro: (r) => (r.status_ativo ? 'Ativo' : 'Inativo'),
        },
      ]}
      campos={[
        {
          name: 'grupo',
          label: 'Grupo',
          type: 'combobox',
          obrigatorio: true,
          opcoes: (gruposQuery.data ?? []).map((g) => g.descricao),
        },
        { name: 'descricao', label: 'Subgrupo', type: 'text', obrigatorio: true },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => (!d.grupo ? 'Selecione o grupo.' : !d.descricao ? 'Informe a descrição do subgrupo.' : null)}
    />
  );
}
