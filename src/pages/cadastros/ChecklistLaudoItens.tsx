import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';

interface ChecklistLaudoItem {
  id: number;
  tipo_equipamento_laudo_id: number;
  descricao: string;
  ordem: number;
  status_ativo: boolean;
}

export function ChecklistLaudoItens() {
  const tiposQuery = useQuery({
    queryKey: ['tipos-equipamento-laudo-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_equipamento_laudo')
        .select('id, descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { id: number; descricao: string }[];
    },
  });

  function nomeTipo(id: number) {
    return tiposQuery.data?.find((t) => t.id === id)?.descricao ?? `#${id}`;
  }

  return (
    <CrudPage<ChecklistLaudoItem>
      titulo="Checklist de laudo (itens por tipo de equipamento)"
      tabela="checklist_laudo_itens"
      ordenarPor="ordem"
      camposFiltro={['descricao']}
      valorInicial={{ status_ativo: true, ordem: 0 }}
      colunas={[
        {
          chave: 'tipo_equipamento_laudo_id',
          label: 'Tipo de equipamento',
          render: (r) => nomeTipo(r.tipo_equipamento_laudo_id),
          valorFiltro: (r) => nomeTipo(r.tipo_equipamento_laudo_id),
        },
        { chave: 'descricao', label: 'Item do checklist' },
        { chave: 'ordem', label: 'Ordem' },
        {
          chave: 'status_ativo',
          label: 'Ativo',
          render: (r) => <Badge tono={r.status_ativo ? 'teal' : 'neutro'}>{r.status_ativo ? 'Ativo' : 'Inativo'}</Badge>,
          rotuloFiltro: (r) => (r.status_ativo ? 'Ativo' : 'Inativo'),
        },
      ]}
      campos={[
        {
          name: 'tipo_equipamento_laudo_id',
          label: 'Tipo de equipamento',
          type: 'combobox',
          obrigatorio: true,
          opcoes: (tiposQuery.data ?? []).map((t) => ({ value: String(t.id), label: t.descricao })),
        },
        { name: 'descricao', label: 'Item do checklist (ex: Limpeza interna)', type: 'text', obrigatorio: true },
        { name: 'ordem', label: 'Ordem de exibição', type: 'number' },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) =>
        !d.tipo_equipamento_laudo_id ? 'Selecione o tipo de equipamento.' : !d.descricao ? 'Informe o item do checklist.' : null
      }
      antesDeEnviar={(d) => ({
        ...d,
        tipo_equipamento_laudo_id: Number(d.tipo_equipamento_laudo_id),
        ordem: d.ordem ? Number(d.ordem) : 0,
      })}
    />
  );
}
