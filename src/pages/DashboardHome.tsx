import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ThOrdenavel } from '../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../lib/useOrdenacao';
import { useFiltrosColuna } from '../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../components/FiltroColunaValores';
import { supabase } from '../lib/supabaseClient';
import { CarregandoTela } from '../components/CarregandoTela';
import { Badge } from '../components/Badge';
import { tonoDoStatusOS, STATUS_ENTREGUE, STATUS_DEVOLUCAO_SEM_REPARO } from '../lib/statusOS';
import { useEntradaOrcamentoPorOS } from '../lib/useEntradaOrcamentoPorOS';

const COLUNAS_FILTRAVEIS = [
  'codigo_entrada',
  'numero_os',
  'numero_orcamento',
  'cliente_nome',
  'equipamento',
  'optica_sn',
  'status_os',
  'data_abertura',
];

interface OrdemServicoResumo {
  id: number;
  numero_os: string;
  cliente_nome: string;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
  status_os: string | null;
  data_abertura: string;
}

// Todas as OS que ainda estão em execução - some da lista assim que chega
// em "Entregue ao cliente" ou "Devolução sem reparo" (essas duas ficam só
// em "Entrega ao cliente"/histórico, não fazem sentido aqui).
const STATUS_FINALIZADOS = [STATUS_ENTREGUE, STATUS_DEVOLUCAO_SEM_REPARO];

export function DashboardHome() {
  const navigate = useNavigate();
  const { codigoEntradaPorOS, orcamentoPorOS } = useEntradaOrcamentoPorOS();
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();

  const query = useQuery({
    queryKey: ['os-em-execucao'],
    queryFn: async (): Promise<OrdemServicoResumo[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, cliente_nome, optica_desc, optica_fab, optica_sn, status_os, data_abertura')
        .order('data_abertura', { ascending: false });
      if (error) throw error;
      return data as OrdemServicoResumo[];
    },
  });

  function valorColuna(os: OrdemServicoResumo, chave: string): unknown {
    if (chave === 'equipamento') return [os.optica_desc, os.optica_fab].filter(Boolean).join(' - ');
    if (chave === 'data_abertura') return os.data_abertura;
    if (chave === 'codigo_entrada') return codigoEntradaPorOS.get(os.id) ?? '';
    if (chave === 'numero_orcamento') return orcamentoPorOS.get(os.id)?.numero ?? '';
    return (os as unknown as Record<string, unknown>)[chave];
  }

  const emExecucao = (query.data ?? []).filter((os) => !STATUS_FINALIZADOS.includes(os.status_os ?? ''));

  const linhasFiltradas = emExecucao.filter((os) =>
    COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(os, chave), chave)),
  );
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Painel do laboratório & oficina</h1>
        {algumFiltroAtivo && (
          <button className="botao-secundario botao-pequeno" onClick={limparTudo}>
            Limpar filtros
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-400)', marginTop: -8, marginBottom: 16 }}>
        Todas as ordens de serviço em execução ({linhas.length}) - já entregues ou devolvidas sem reparo saem
        automaticamente desta lista.
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['codigo_entrada', 'Entrada'],
              ['numero_os', 'OS'],
              ['numero_orcamento', 'Orçamento'],
              ['cliente_nome', 'Cliente'],
              ['equipamento', 'Equipamento'],
              ['optica_sn', 'Nº de série'],
              ['status_os', 'Status'],
              ['data_abertura', 'Aberta em'],
            ].map(([chave, label]) => (
              <ThOrdenavel key={chave} chave={chave} colunaAtiva={coluna} direcao={direcao} onClick={ordenarPor}>
                {label}
              </ThOrdenavel>
            ))}
          </tr>
          <tr>
            {COLUNAS_FILTRAVEIS.map((chave) => {
              const valoresDisponiveis = Array.from(
                new Set(emExecucao.map((os) => String(valorColuna(os, chave) ?? ''))),
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
          </tr>
        </thead>
        <tbody>
          {linhas.map((os) => {
            const orcamento = orcamentoPorOS.get(os.id);
            return (
              <tr key={os.id}>
                <td>
                  <span className="link-numero mono" onClick={() => navigate(`/registro-entrada?os=${os.id}`)}>
                    {codigoEntradaPorOS.get(os.id) ?? '-'}
                  </span>
                </td>
                <td>
                  <span
                    className="link-numero mono"
                    title="Abrir orçamento técnico desta OS"
                    onClick={() => navigate(`/orcamento-tecnico?os=${os.id}`)}
                  >
                    {os.numero_os}
                  </span>
                </td>
                <td>
                  {orcamento ? (
                    <span
                      className="link-numero mono"
                      onClick={() => navigate(`/orcamento-tecnico?os=${os.id}&orcamento=${orcamento.id}`)}
                    >
                      {orcamento.numero}
                    </span>
                  ) : (
                    <span className="mono" style={{ color: 'var(--ink-400)' }}>
                      -
                    </span>
                  )}
                </td>
                <td>{os.cliente_nome}</td>
                <td>{[os.optica_desc, os.optica_fab].filter(Boolean).join(' - ') || '-'}</td>
                <td className="mono">{os.optica_sn || '-'}</td>
                <td>
                  <Badge tono={tonoDoStatusOS(os.status_os)}>{os.status_os ?? '-'}</Badge>
                </td>
                <td>{new Date(os.data_abertura).toLocaleDateString('pt-BR')}</td>
              </tr>
            );
          })}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={8}>Nenhuma OS em execução encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
