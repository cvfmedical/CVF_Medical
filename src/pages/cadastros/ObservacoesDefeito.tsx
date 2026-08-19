import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';

interface ObservacaoDefeito {
  id: number;
  descricao: string;
  grupo: string | null;
  subgrupo: string | null;
  status_ativo: boolean;
}

export function ObservacoesDefeito() {
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

  const subgruposQuery = useQuery({
    queryKey: ['subgrupos-produtos-servicos-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subgrupos')
        .select('grupo, descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { grupo: string; descricao: string }[];
    },
  });

  return (
    <CrudPage<ObservacaoDefeito>
      titulo="Observações de defeito"
      tabela="observacoes_defeito"
      ordenarPor="descricao"
      camposFiltro={['descricao', 'grupo', 'subgrupo']}
      valorInicial={{ status_ativo: true }}
      colunas={[
        { chave: 'descricao', label: 'Descrição' },
        { chave: 'grupo', label: 'Grupo' },
        { chave: 'subgrupo', label: 'Subgrupo' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
          rotuloFiltro: (r) => (r.status_ativo ? 'Ativo' : 'Inativo'),
        },
      ]}
      campos={[
        { name: 'descricao', label: 'Descrição', type: 'textarea', obrigatorio: true },
        {
          name: 'grupo',
          label: 'Grupo (opcional - deixe em branco pra aparecer pra qualquer grupo)',
          type: 'combobox',
          opcoes: (gruposQuery.data ?? []).map((g) => g.descricao),
        },
        {
          name: 'subgrupo',
          label: 'Subgrupo (opcional - combine com o grupo acima; a lista abaixo mostra "grupo › subgrupo")',
          type: 'combobox',
          opcoes: (subgruposQuery.data ?? []).map((s) => ({ value: s.descricao, label: `${s.grupo} › ${s.descricao}` })),
        },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => (!d.descricao ? 'Informe a descrição.' : null)}
    />
  );
}
