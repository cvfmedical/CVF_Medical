import { useState } from 'react';
import { normalizarBusca } from '../../lib/normalizarBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useNavigate } from 'react-router-dom';
import { CarregandoTela } from '../../components/CarregandoTela';
import { useOrcamentosAprovados, type OrcamentoAprovado } from '../../lib/useOrcamentosAprovados';
import { useAuth } from '../../contexts/AuthContext';

// Consulta para o técnico ver, em ordem de aprovação (quem aprovou
// primeiro aparece primeiro), quais orçamentos já foram aprovados pelo
// cliente e estão prontos para iniciar a manutenção. Atualiza sozinha
// (poll de 30s) conforme novas aprovações chegam pelo portal do cliente
// ou pela aprovação manual do financeiro. Query compartilhada com o
// alerta flutuante (AlertaOrcamentosAprovados).
export function OrcamentosAprovados() {
  const navigate = useNavigate();
  const { temPermissao } = useAuth();
  const podeVerValor = temPermissao('financeiro');
  const query = useOrcamentosAprovados();
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, string>>({});

  function total(o: OrcamentoAprovado) {
    if (o.valor_fixo_contrato != null) return o.valor_fixo_contrato;
    return o.orcamento_itens.reduce((soma, i) => soma + (i.preco_unitario ?? 0) * i.quantidade, 0);
  }

  function iniciarManutencao(osId: number) {
    navigate(`/manutencao?os=${osId}`);
  }

  // Fica ANTES do "if isLoading" porque useLinhasOrdenadas é um hook - não
  // pode ser chamado condicionalmente.
  function valorColuna(o: OrcamentoAprovado, chave: string): unknown {
    if (chave === 'data_resposta_cliente') return o.data_resposta_cliente;
    if (chave === 'numero_os') return o.ordens_servico?.numero_os ?? '';
    if (chave === 'cliente_nome') return o.ordens_servico?.cliente_nome ?? '';
    if (chave === 'equipamento')
      return [o.ordens_servico?.optica_desc, o.ordens_servico?.optica_fab, o.ordens_servico?.optica_sn]
        .filter(Boolean)
        .join(' ');
    if (chave === 'valor') return total(o);
    return (o as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (query.data ?? []).filter((o) => {
    const ativos = Object.entries(filtrosColuna).filter(([, v]) => v.trim());
    return ativos.every(([chave, termo]) =>
      normalizarBusca(String(valorColuna(o, chave) ?? '')).includes(normalizarBusca(termo.trim())),
    );
  });
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

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
            {[
              ['data_resposta_cliente', 'Aprovado em'],
              ['numero_orcamento', 'Nº orçamento'],
              ['numero_os', 'OS'],
              ['cliente_nome', 'Cliente'],
              ['equipamento', 'Equipamento'],
              ...(podeVerValor ? [['valor', 'Valor']] : []),
            ].map(([chave, label]) => (
              <ThOrdenavel key={chave} chave={chave} colunaAtiva={coluna} direcao={direcao} onClick={ordenarPor}>
                {label}
              </ThOrdenavel>
            ))}
            <th></th>
          </tr>
          <tr>
            {[
              'data_resposta_cliente',
              'numero_orcamento',
              'numero_os',
              'cliente_nome',
              'equipamento',
              ...(podeVerValor ? ['valor'] : []),
            ].map((chave) => (
              <th key={chave} style={{ padding: '2px 6px' }}>
                <input
                  type="text"
                  className="campo-filtro-coluna"
                  placeholder="Filtrar..."
                  value={filtrosColuna[chave] ?? ''}
                  onChange={(e) => setFiltrosColuna((f) => ({ ...f, [chave]: e.target.value }))}
                />
              </th>
            ))}
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
              {podeVerValor && <td>R$ {total(o).toFixed(2)}</td>}
              <td className="acoes-tabela">
                <button className="botao-primario botao-pequeno" onClick={() => iniciarManutencao(o.ordem_servico_id)}>
                  Iniciar manutenção
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={podeVerValor ? 7 : 6}>Nenhum orçamento encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
