import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { useGarantiasAtivas, type LinhaGarantiaAtiva, DIAS_GARANTIA } from '../../lib/garantia';

const COLUNAS_FILTRAVEIS = ['clienteNome', 'equipamento', 'numeroSerie', 'numeroOS', 'dataEntrega', 'garantiaAte'];

// Todo equipamento (cliente + nº de série) cujo último reparo aprovado
// ainda está dentro dos 90 dias de garantia (GARANTIA_CVF, formato.ts) -
// mesma regra do alerta que aparece na Entrada/Orçamento/Precificação
// quando esse equipamento volta antes do prazo vencer.
export function GarantiasAtivas() {
  const query = useGarantiasAtivas();
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();

  function valorColuna(l: LinhaGarantiaAtiva, chave: string): unknown {
    if (chave === 'equipamento') return [l.equipamentoDesc, l.equipamentoFab].filter(Boolean).join(' ');
    return (l as unknown as Record<string, unknown>)[chave];
  }

  function tonoDias(dias: number): 'danger' | 'ambar' | 'teal' {
    if (dias <= 7) return 'danger';
    if (dias <= 30) return 'ambar';
    return 'teal';
  }

  const linhasFiltradas = (query.data ?? []).filter((l) =>
    COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(l, chave), chave)),
  );
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Garantias ativas</h1>
        {algumFiltroAtivo && (
          <button className="botao-secundario botao-pequeno" onClick={limparTudo}>
            Limpar filtros
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Equipamentos cujo último reparo aprovado ainda está dentro dos {DIAS_GARANTIA} dias de garantia, contados a
        partir da data de entrega ao cliente. Se esse mesmo equipamento (mesmo cliente + nº de série) voltar antes do
        prazo vencer, um alerta aparece na Entrada, no Orçamento técnico e na Precificação.
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['clienteNome', 'Cliente'],
              ['equipamento', 'Equipamento'],
              ['numeroSerie', 'Nº de série'],
              ['numeroOS', 'OS do reparo'],
              ['dataEntrega', 'Entregue em'],
              ['garantiaAte', 'Garantia até'],
              ['diasRestantes', 'Dias restantes'],
            ].map(([chave, label]) => (
              <ThOrdenavel key={chave} chave={chave} colunaAtiva={coluna} direcao={direcao} onClick={ordenarPor}>
                {label}
              </ThOrdenavel>
            ))}
          </tr>
          <tr>
            {COLUNAS_FILTRAVEIS.map((chave) => {
              const valoresDisponiveis = Array.from(
                new Set((query.data ?? []).map((l) => String(valorColuna(l, chave) ?? ''))),
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
          {linhas.map((l) => (
            <tr key={l.ordemServicoId}>
              <td>{l.clienteNome}</td>
              <td>
                {l.equipamentoDesc} {l.equipamentoFab ? `(${l.equipamentoFab})` : ''}
              </td>
              <td className="mono">{l.numeroSerie ?? '-'}</td>
              <td className="mono">{l.numeroOS}</td>
              <td>{new Date(l.dataEntrega).toLocaleDateString('pt-BR')}</td>
              <td>{new Date(l.garantiaAte).toLocaleDateString('pt-BR')}</td>
              <td>
                <Badge tono={tonoDias(l.diasRestantes)}>
                  {l.diasRestantes} {l.diasRestantes === 1 ? 'dia' : 'dias'}
                </Badge>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhum equipamento em garantia no momento.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
