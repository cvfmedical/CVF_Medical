import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { CarregandoTela } from '../../components/CarregandoTela';

interface OrcamentoAprovado {
  id: number;
  numero_orcamento: string;
  ordem_servico_id: number;
  data_resposta_cliente: string | null;
  ordens_servico: {
    numero_os: string;
    cliente_nome: string;
    optica_desc: string | null;
    optica_fab: string | null;
    optica_sn: string | null;
  } | null;
  orcamento_itens: { quantidade: number; preco_unitario: number | null }[];
}

// Consulta para o técnico ver, em ordem de aprovação (quem aprovou
// primeiro aparece primeiro), quais orçamentos já foram aprovados pelo
// cliente e estão prontos para iniciar a manutenção. Atualiza sozinha
// (poll de 30s) conforme novas aprovações chegam pelo portal do cliente
// ou pela aprovação manual do financeiro.
export function OrcamentosAprovados() {
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['orcamentos-aprovados'],
    refetchInterval: 30_000,
    queryFn: async (): Promise<OrcamentoAprovado[]> => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select(
          'id, numero_orcamento, ordem_servico_id, data_resposta_cliente, ordens_servico(numero_os, cliente_nome, optica_desc, optica_fab, optica_sn), orcamento_itens(quantidade, preco_unitario)',
        )
        .eq('status', 'Aprovado')
        .order('data_resposta_cliente', { ascending: true });
      if (error) throw error;
      return data as unknown as OrcamentoAprovado[];
    },
  });

  function total(o: OrcamentoAprovado) {
    return o.orcamento_itens.reduce((soma, i) => soma + (i.preco_unitario ?? 0) * i.quantidade, 0);
  }

  function iniciarManutencao(o: OrcamentoAprovado) {
    navigate(`/manutencao?os=${o.ordem_servico_id}`);
  }

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Orçamentos aprovados</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Ordem de chegada da aprovação do cliente - o primeiro a aprovar aparece primeiro. Atualiza sozinha conforme
        novas aprovações chegam.
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Aprovado em</th>
            <th>Nº orçamento</th>
            <th>OS</th>
            <th>Cliente</th>
            <th>Equipamento</th>
            <th>Valor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(query.data ?? []).map((o) => (
            <tr key={o.id}>
              <td>{o.data_resposta_cliente ? new Date(o.data_resposta_cliente).toLocaleString('pt-BR') : '-'}</td>
              <td className="mono">{o.numero_orcamento}</td>
              <td className="mono">{o.ordens_servico?.numero_os}</td>
              <td>{o.ordens_servico?.cliente_nome}</td>
              <td>
                {o.ordens_servico?.optica_desc} ({o.ordens_servico?.optica_fab}) -{' '}
                <span className="mono">{o.ordens_servico?.optica_sn}</span>
              </td>
              <td>R$ {total(o).toFixed(2)}</td>
              <td className="acoes-tabela">
                <button className="botao-primario botao-pequeno" onClick={() => iniciarManutencao(o)}>
                  Iniciar manutenção
                </button>
              </td>
            </tr>
          ))}
          {(query.data ?? []).length === 0 && (
            <tr>
              <td colSpan={7}>Nenhum orçamento aprovado aguardando manutenção.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
