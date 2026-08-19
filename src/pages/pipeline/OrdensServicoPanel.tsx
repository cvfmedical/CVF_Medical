import { useState } from 'react';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { type ChecklistAvarias } from '../../lib/checklistAvarias';
import { useAvariasTriagem } from '../../lib/useAvariasTriagem';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { Badge } from '../../components/Badge';
import { tonoDoStatusOS, STATUS_ENTREGUE, STATUS_DEVOLUCAO_SEM_REPARO } from '../../lib/statusOS';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmarSenha } from '../../lib/useConfirmarSenha';
import { mensagemErro } from '../../lib/erros';
import { IconTrash } from '@tabler/icons-react';

// OS ainda não iniciou manutenção física - único momento em que dá pra
// excluir por completo (espelha a checagem feita em excluir_os_completa,
// no banco - a função é quem realmente garante isso, isso aqui é só pra
// decidir se mostra o botão).
const STATUS_EXCLUIVEIS = [
  '1. TRIAGEM / RECEBIMENTO',
  '2. AGUARDANDO ORÇAMENTO',
  '2B. AGUARDANDO PRECIFICAÇÃO',
  '3. AGUARDANDO APROVAÇÃO DO CLIENTE',
];

const COLUNAS_FILTRAVEIS = ['numero_os', 'cliente_nome', 'optica_desc', 'optica_sn', 'status_os', 'data_abertura'];

interface OrdemServico {
  id: number;
  numero_os: string;
  cliente_nome: string;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
  defeito_relatado: string | null;
  status_os: string | null;
  triagem_avarias: ChecklistAvarias | null;
  data_abertura: string;
}

// Une o que antes eram duas telas separadas (Fila de Triagem + Histórico
// de Equipamentos) num único painel: lista todas as OS, com busca;
// clicar numa linha mostra os detalhes completos (checklist de avarias
// da triagem, defeito relatado etc.). O status não é editável aqui -
// ele muda sozinho conforme a OS avança pelas telas do fluxo real
// (orçamento, aprovação do cliente, manutenção, selagem, testes,
// entrega); editar isso à mão aqui destoava do fluxo de verdade.

export function OrdensServicoPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { funcionario } = useAuth();
  const { pedirConfirmacao, ModalConfirmacao } = useConfirmarSenha();
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();
  const [detalhe, setDetalhe] = useState<OrdemServico | null>(null);
  const avariasTriagemQuery = useAvariasTriagem();
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['ordens-servico-painel'],
    queryFn: async (): Promise<OrdemServico[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*')
        .order('data_abertura', { ascending: false });
      if (error) throw error;
      return data as OrdemServico[];
    },
  });

  function excluirOS(os: OrdemServico) {
    setErro(null);
    pedirConfirmacao(
      async () => {
        setExcluindo(os.id);
        try {
          const { error } = await supabase.rpc('excluir_os_completa', { p_os_id: os.id });
          if (error) throw error;
          if (detalhe?.id === os.id) setDetalhe(null);
          qc.invalidateQueries({ queryKey: ['ordens-servico-painel'] });
          qc.invalidateQueries({ queryKey: ['entradas_equipamento'] });
        } catch (e) {
          setErro(mensagemErro(e));
        } finally {
          setExcluindo(null);
        }
      },
      {
        titulo: `Excluir ${os.numero_os} por completo?`,
        mensagem: `A OS, o orçamento (se houver) e o vínculo com a entrada de origem serão apagados. A entrada volta para "Aguardando Triagem" - suas fotos e checklist continuam salvos, mas ela precisa ser convertida em OS de novo. Essa ação não pode ser desfeita.`,
      },
    );
  }

  function valorColuna(os: OrdemServico, chave: string): unknown {
    if (chave === 'status_os') return os.status_os ?? '';
    if (chave === 'data_abertura') return os.data_abertura;
    return (os as unknown as Record<string, unknown>)[chave];
  }

  // Sem filtro em nenhuma coluna, esconde as OS já finalizadas (entregue ou
  // devolvida sem reparo) - senão o painel vira um histórico infinito.
  // Assim que alguma coluna é filtrada, passa a buscar em todos os status
  // (inclusive as finalizadas), pra continuar achável.
  const linhasFiltradas = (query.data ?? []).filter((os) => {
    if (!algumFiltroAtivo) {
      return os.status_os !== STATUS_ENTREGUE && os.status_os !== STATUS_DEVOLUCAO_SEM_REPARO;
    }
    return COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(os, chave), chave));
  });
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Ordem de serviço / identificação de peças danificadas</h1>
        {algumFiltroAtivo && (
          <button className="botao-secundario botao-pequeno" onClick={limparTudo}>
            Limpar filtros
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: -8, marginBottom: 8 }}>
        Mostrando só o que ainda está em andamento. OS já entregues ou devolvidas sem reparo saem desta lista - use
        os filtros das colunas abaixo pra encontrá-las.
      </p>

      {erro && <p className="erro-login">{erro}</p>}

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['numero_os', 'Nº OS'],
              ['cliente_nome', 'Cliente'],
              ['optica_desc', 'Equipamento'],
              ['optica_sn', 'Nº de série'],
              ['status_os', 'Status'],
              ['data_abertura', 'Aberta em'],
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
                new Set((query.data ?? []).map((os) => String(valorColuna(os, chave) ?? ''))),
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
          {linhas.map((os) => (
            <tr key={os.id}>
              <td className="mono">{os.numero_os}</td>
              <td>{os.cliente_nome}</td>
              <td>{os.optica_desc}</td>
              <td className="mono">{os.optica_sn}</td>
              <td>
                <Badge tono={tonoDoStatusOS(os.status_os)}>{os.status_os ?? '-'}</Badge>
              </td>
              <td>{new Date(os.data_abertura).toLocaleDateString('pt-BR')}</td>
              <td className="acoes-tabela">
                <button className="botao-secundario" onClick={() => setDetalhe(os)}>
                  Detalhes
                </button>
                <button
                  className="botao-secundario"
                  style={{ marginLeft: 6 }}
                  onClick={() => navigate(`/registro-entrada?os=${os.id}`)}
                >
                  Registro de entrada
                </button>
                <button
                  className="botao-secundario"
                  style={{ marginLeft: 6 }}
                  onClick={() => navigate(`/orcamento-tecnico?os=${os.id}`)}
                >
                  Ver orçamento
                </button>
                {funcionario?.nivel_acesso === 'Administrador' && STATUS_EXCLUIVEIS.includes(os.status_os ?? '') && (
                  <button
                    className="botao-icone perigo"
                    title="Excluir OS por completo"
                    style={{ marginLeft: 6 }}
                    disabled={excluindo === os.id}
                    onClick={() => excluirOS(os)}
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhuma OS encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>

      {detalhe && (
        <ModalJanela titulo={detalhe.numero_os} aoFechar={() => setDetalhe(null)}>
            <div className="campo-form">
              <label>Cliente</label>
              <p>{detalhe.cliente_nome}</p>
            </div>
            <div className="campo-form">
              <label>Equipamento</label>
              <p>
                {detalhe.optica_desc} ({detalhe.optica_fab}) - <span className="mono">{detalhe.optica_sn}</span>
              </p>
            </div>
            <div className="campo-form">
              <label>Defeito relatado</label>
              <p>{detalhe.defeito_relatado || '-'}</p>
            </div>
            <div className="campo-form">
              <label>Avarias identificadas na triagem</label>
              {(avariasTriagemQuery.data ?? []).filter((item) => detalhe.triagem_avarias?.[String(item.id)]).length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Nenhuma avaria marcada</p>
              )}
              {(avariasTriagemQuery.data ?? [])
                .filter((item) => detalhe.triagem_avarias?.[String(item.id)])
                .map((item) => (
                  <Badge key={item.id} tono="copper">
                    {item.descricao}
                  </Badge>
                ))}
            </div>
            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
            </div>
        </ModalJanela>
      )}

      {ModalConfirmacao}
    </div>
  );
}
