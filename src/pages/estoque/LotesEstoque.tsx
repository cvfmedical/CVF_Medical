import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '../../components/CrudPage';
import { Badge } from '../../components/Badge';
import { supabase } from '../../lib/supabaseClient';

interface LoteEstoque {
  id: number;
  produto_servico_id: number;
  numero_lote: string;
  quantidade: number;
  data_validade: string;
  status_ativo: boolean;
  observacoes: string | null;
}

function statusValidade(dataValidade: string): { texto: string; tono: 'danger' | 'copper' | 'teal' } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade + 'T00:00:00');
  const diasRestantes = Math.floor((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0) return { texto: 'Vencido', tono: 'danger' };
  if (diasRestantes <= 30) return { texto: `Vence em ${diasRestantes}d`, tono: 'copper' };
  return { texto: 'Válido', tono: 'teal' };
}

export function LotesEstoque() {
  const produtosQuery = useQuery({
    queryKey: ['produtos-servicos-opcoes-lotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos_servicos')
        .select('id, nome')
        .eq('status_ativo', true)
        .order('nome');
      if (error) throw error;
      return data as { id: number; nome: string }[];
    },
  });

  function nomeProduto(id: number) {
    return produtosQuery.data?.find((p) => p.id === id)?.nome ?? `#${id}`;
  }

  return (
    <CrudPage<LoteEstoque>
      titulo="Controle de lotes/validade"
      tabela="lotes_estoque"
      ordenarPor="data_validade"
      camposFiltro={['numero_lote']}
      valorInicial={{ status_ativo: true, quantidade: 0 }}
      colunas={[
        { chave: 'produto_servico_id', label: 'Produto/peça', render: (r) => nomeProduto(r.produto_servico_id) },
        { chave: 'numero_lote', label: 'Nº do lote', mono: true },
        { chave: 'quantidade', label: 'Quantidade' },
        {
          chave: 'data_validade',
          label: 'Validade',
          render: (r) => new Date(r.data_validade + 'T00:00:00').toLocaleDateString('pt-BR'),
        },
        {
          chave: 'status_ativo',
          label: 'Status',
          render: (r) => {
            const s = statusValidade(r.data_validade);
            return <Badge tono={s.tono}>{s.texto}</Badge>;
          },
        },
      ]}
      campos={[
        {
          name: 'produto_servico_id',
          label: 'Produto/peça',
          type: 'combobox',
          obrigatorio: true,
          opcoes: (produtosQuery.data ?? []).map((p) => ({ value: String(p.id), label: p.nome })),
        },
        { name: 'numero_lote', label: 'Número do lote', type: 'text', obrigatorio: true },
        { name: 'quantidade', label: 'Quantidade', type: 'number', obrigatorio: true },
        { name: 'data_validade', label: 'Data de validade', type: 'date', obrigatorio: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea' },
        { name: 'status_ativo', label: 'Ativo', type: 'checkbox' },
      ]}
      validar={(d) => {
        if (!d.produto_servico_id) return 'Selecione o produto/peça.';
        if (!d.numero_lote) return 'Informe o número do lote.';
        if (!d.data_validade) return 'Informe a data de validade.';
        return null;
      }}
      antesDeEnviar={(d) => ({
        ...d,
        produto_servico_id: Number(d.produto_servico_id),
        quantidade: d.quantidade ? Number(d.quantidade) : 0,
      })}
    />
  );
}
