import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { useNavigate } from 'react-router-dom';
import { CarregandoTela } from '../../components/CarregandoTela';
import {
  useOrcamentosAguardandoAprovacao,
  type OrcamentoAguardandoAprovacao,
} from '../../lib/useOrcamentosAguardandoAprovacao';

const COLUNAS_FILTRAVEIS = ['data_envio', 'dias', 'numero_orcamento', 'numero_os', 'cliente_nome', 'equipamento', 'valor'];

// Orçamentos já enviados ao cliente, aguardando ele aprovar ou recusar -
// útil pra saber quem cobrar/ligar. Ordenado do mais antigo pro mais
// recente (quem está esperando há mais tempo aparece primeiro).
export function OrcamentosAguardandoAprovacao() {
  const navigate = useNavigate();
  const query = useOrcamentosAguardandoAprovacao();
  const { textos: filtrosColuna, setTexto: setFiltroTexto, valores: filtrosValores, setValoresColuna, passaFiltro } = useFiltrosColuna();

  function total(o: OrcamentoAguardandoAprovacao) {
    if (o.valor_fixo_contrato != null) return o.valor_fixo_contrato;
    return o.orcamento_itens.reduce((soma, i) => soma + (i.preco_unitario ?? 0) * i.quantidade, 0);
  }

  function diasAguardando(o: OrcamentoAguardandoAprovacao) {
    if (!o.data_envio) return null;
    const ms = Date.now() - new Date(o.data_envio).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  // Fica ANTES do "if isLoading" porque useLinhasOrdenadas é um hook - não
  // pode ser chamado condicionalmente.
  function valorColuna(o: OrcamentoAguardandoAprovacao, chave: string): unknown {
    if (chave === 'data_envio') return o.data_envio;
    if (chave === 'dias') return diasAguardando(o) ?? -1;
    if (chave === 'numero_os') return o.ordens_servico?.numero_os ?? '';
    if (chave === 'cliente_nome') return o.ordens_servico?.cliente_nome ?? '';
    if (chave === 'equipamento')
      return [o.ordens_servico?.optica_desc, o.ordens_servico?.optica_fab, o.ordens_servico?.optica_sn]
        .filter(Boolean)
        .join(' ');
    if (chave === 'valor') return total(o);
    return (o as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (query.data ?? []).filter((o) =>
    COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(o, chave), chave)),
  );
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Orçamentos aguardando aprovação</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Já foram enviados ao cliente e ainda não tiveram resposta (nem aprovado, nem recusado). Do mais antigo pro
        mais recente - quem está esperando há mais tempo aparece primeiro. Atualiza sozinha conforme o cliente
        responde.
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['data_envio', 'Enviado em'],
              ['dias', 'Dias aguardando'],
              ['numero_orcamento', 'Nº orçamento'],
              ['numero_os', 'OS'],
              ['cliente_nome', 'Cliente'],
              ['equipamento', 'Equipamento'],
              ['valor', 'Valor'],
            ].map(([chave, label]) => (
              <ThOrdenavel key={chave} chave={chave} colunaAtiva={coluna} direcao={direcao} onClick={ordenarPor}>
                {label}
              </ThOrdenavel>
            ))}
            <th></th>
          </tr>
          <tr>
            {COLUNAS_FILTRAVEIS.map((chave) => {
              const valoresDisponiveis = Array.from(
                new Set((query.data ?? []).map((o) => String(valorColuna(o, chave) ?? ''))),
              ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
              return (
                <th key={chave} style={{ padding: '2px 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="campo-filtro-coluna"
                      placeholder="Filtrar..."
                      value={filtrosColuna[chave] ?? ''}
                      onChange={(e) => setFiltroTexto(chave, e.target.value)}
                    />
                    <FiltroColunaValores
                      valores={valoresDisponiveis}
                      selecionados={filtrosValores[chave] ?? new Set()}
                      onChange={(v) => setValoresColuna(chave, v)}
                    />
                  </div>
                </th>
              );
            })}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((o) => {
            const dias = diasAguardando(o);
            return (
              <tr key={o.id}>
                <td>{o.data_envio ? new Date(o.data_envio).toLocaleString('pt-BR') : '-'}</td>
                <td>
                  {dias == null ? (
                    '-'
                  ) : (
                    <span style={{ color: dias >= 5 ? 'var(--danger-500)' : dias >= 2 ? 'var(--ambar-800)' : 'inherit', fontWeight: dias >= 2 ? 600 : 400 }}>
                      {dias} {dias === 1 ? 'dia' : 'dias'}
                    </span>
                  )}
                </td>
                <td className="mono">{o.numero_orcamento}</td>
                <td className="mono">{o.ordens_servico?.numero_os}</td>
                <td>{o.ordens_servico?.cliente_nome}</td>
                <td>
                  {o.ordens_servico?.optica_desc} ({o.ordens_servico?.optica_fab}) -{' '}
                  <span className="mono">{o.ordens_servico?.optica_sn}</span>
                </td>
                <td>R$ {total(o).toFixed(2)}</td>
                <td className="acoes-tabela">
                  <button
                    className="botao-primario botao-pequeno"
                    onClick={() => navigate(`/orcamento-financeiro?orcamento=${o.id}`)}
                    title="Abre este orçamento direto no Financeiro, já pronto para aprovar/recusar manualmente"
                  >
                    Aprovar
                  </button>
                </td>
              </tr>
            );
          })}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={8}>Nenhum orçamento aguardando aprovação do cliente.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
