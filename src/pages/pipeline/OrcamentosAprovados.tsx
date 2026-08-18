import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CarregandoTela } from '../../components/CarregandoTela';
import { useOrcamentosAprovados, type OrcamentoAprovado } from '../../lib/useOrcamentosAprovados';

// Consulta para o técnico ver, em ordem de aprovação (quem aprovou
// primeiro aparece primeiro), quais orçamentos já foram aprovados pelo
// cliente e estão prontos para iniciar a manutenção. Atualiza sozinha
// (poll de 30s) conforme novas aprovações chegam pelo portal do cliente
// ou pela aprovação manual do financeiro. Query compartilhada com o
// alerta flutuante (AlertaOrcamentosAprovados).
export function OrcamentosAprovados() {
  const navigate = useNavigate();
  const query = useOrcamentosAprovados();
  const [filtro, setFiltro] = useState('');

  function total(o: OrcamentoAprovado) {
    if (o.valor_fixo_contrato != null) return o.valor_fixo_contrato;
    return o.orcamento_itens.reduce((soma, i) => soma + (i.preco_unitario ?? 0) * i.quantidade, 0);
  }

  function iniciarManutencao(osId: number) {
    navigate(`/manutencao?os=${osId}`);
  }

  if (query.isLoading) return <CarregandoTela />;

  const linhas = (query.data ?? []).filter((o) => {
    if (!filtro.trim()) return true;
    const termo = filtro.trim().toLowerCase();
    return (
      o.numero_orcamento.toLowerCase().includes(termo) ||
      (o.ordens_servico?.numero_os ?? '').toLowerCase().includes(termo) ||
      (o.ordens_servico?.cliente_nome ?? '').toLowerCase().includes(termo) ||
      (o.ordens_servico?.optica_desc ?? '').toLowerCase().includes(termo)
    );
  });

  return (
    <div>
      <h1>Orçamentos aprovados</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Ordem de chegada da aprovação do cliente - o primeiro a aprovar aparece primeiro. Atualiza sozinha conforme
        novas aprovações chegam.
      </p>

      <input
        className="campo-filtro"
        placeholder="Buscar por nº orçamento, OS, cliente ou equipamento..."
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />

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
          {linhas.map((o) => (
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
                <button className="botao-primario botao-pequeno" onClick={() => iniciarManutencao(o.ordem_servico_id)}>
                  Iniciar manutenção
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhum orçamento encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
