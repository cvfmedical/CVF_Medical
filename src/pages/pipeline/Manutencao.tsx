import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { IconPlus } from '@tabler/icons-react';

interface ItemChecklist {
  item_id: number;
  produto_nome: string;
  quantidade: number;
  substituido: boolean;
}

interface ManutencaoRow {
  id: number;
  ordem_servico_id: number;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
  checklist: ItemChecklist[] | null;
}

interface OSDetalhe {
  numero_os: string;
  cliente_nome: string;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
  defeito_relatado: string | null;
}

export function Manutencao() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const { opcoes, porId, isLoading } = useOrdensServicoOpcoes();
  const [modalAberto, setModalAberto] = useState(false);
  const [osId, setOsId] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [checklist, setChecklist] = useState<ItemChecklist[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const manutencoesQuery = useQuery({
    queryKey: ['manutencoes'],
    queryFn: async (): Promise<ManutencaoRow[]> => {
      const { data, error } = await supabase.from('manutencoes').select('*').order('id', { ascending: false });
      if (error) throw error;
      return data as ManutencaoRow[];
    },
  });

  const osDetalheQuery = useQuery({
    queryKey: ['os-detalhe', osId],
    enabled: !!osId,
    queryFn: async (): Promise<OSDetalhe> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('numero_os, cliente_nome, optica_desc, optica_fab, optica_sn, defeito_relatado')
        .eq('id', Number(osId))
        .single();
      if (error) throw error;
      return data as OSDetalhe;
    },
  });

  const itensOrcamentoQuery = useQuery({
    queryKey: ['itens-orcamento-para-manutencao', osId],
    enabled: !!osId,
    queryFn: async (): Promise<ItemChecklist[]> => {
      const { data: orcamento } = await supabase
        .from('orcamentos')
        .select('id')
        .eq('ordem_servico_id', Number(osId))
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!orcamento) return [];
      const { data, error } = await supabase
        .from('orcamento_itens')
        .select('id, quantidade, descricao_servico, produtos_servicos(nome)')
        .eq('orcamento_id', orcamento.id);
      if (error) throw error;
      return (
        data as unknown as {
          id: number;
          quantidade: number;
          descricao_servico: string | null;
          produtos_servicos: { nome: string } | null;
        }[]
      ).map((item) => ({
        item_id: item.id,
        produto_nome: item.produtos_servicos?.nome ?? item.descricao_servico ?? '-',
        quantidade: item.quantidade,
        substituido: false,
      }));
    },
  });

  function abrirNova() {
    setOsId('');
    setDataInicio('');
    setDataFim('');
    setObservacoes('');
    setChecklist([]);
    setErro(null);
    setModalAberto(true);
  }

  // Pré-seleciona a OS quando vem de "Iniciar manutenção" (Orçamentos aprovados).
  useEffect(() => {
    const osParam = searchParams.get('os');
    if (osParam) {
      setOsId(osParam);
      setDataInicio('');
      setDataFim('');
      setObservacoes('');
      setErro(null);
      setModalAberto(true);
    }
  }, [searchParams]);

  function selecionarOS(valor: string) {
    setOsId(valor);
    setChecklist([]);
  }

  // Assim que os itens do orçamento chegam (ou a OS muda), inicializa o checklist.
  useEffect(() => {
    if (itensOrcamentoQuery.data) setChecklist(itensOrcamentoQuery.data);
  }, [itensOrcamentoQuery.data]);

  function alternarItem(itemId: number) {
    setChecklist((lista) =>
      lista.map((item) => (item.item_id === itemId ? { ...item, substituido: !item.substituido } : item)),
    );
  }

  async function salvar() {
    setErro(null);
    if (!osId) {
      setErro('Selecione a ordem de serviço.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from('manutencoes').insert({
        ordem_servico_id: Number(osId),
        data_inicio: dataInicio || null,
        data_fim: dataFim || null,
        observacoes: observacoes || null,
        checklist,
      });
      if (error) throw error;

      // Data de fim preenchida = manutenção concluída - avança para o
      // próximo checkpoint automaticamente.
      if (dataFim) {
        await supabase
          .from('ordens_servico')
          .update({ status_os: '5. BANCADA DE VISÃO - CHECKPOINT A' })
          .eq('id', Number(osId));
      }

      setModalAberto(false);
      qc.invalidateQueries({ queryKey: ['manutencoes'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (isLoading || manutencoesQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Manutenção / remontagem</h1>
        <button className="botao-primario botao-pequeno" onClick={abrirNova}>
          <IconPlus size={16} /> Novo
        </button>
      </div>

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>OS</th>
            <th>Início</th>
            <th>Fim</th>
            <th>Itens substituídos</th>
            <th>Observações</th>
          </tr>
        </thead>
        <tbody>
          {(manutencoesQuery.data ?? []).map((m) => (
            <tr key={m.id}>
              <td className="mono">{porId(m.ordem_servico_id)?.numero_os ?? `#${m.ordem_servico_id}`}</td>
              <td>{m.data_inicio ? new Date(m.data_inicio).toLocaleDateString('pt-BR') : '-'}</td>
              <td>{m.data_fim ? new Date(m.data_fim).toLocaleDateString('pt-BR') : '-'}</td>
              <td>
                {(m.checklist ?? [])
                  .filter((i) => i.substituido)
                  .map((i) => i.produto_nome)
                  .join(', ') || '-'}
              </td>
              <td>{m.observacoes}</td>
            </tr>
          ))}
          {(manutencoesQuery.data ?? []).length === 0 && (
            <tr>
              <td colSpan={5}>Nenhum registro encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <div className="modal-fundo">
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h2>Nova manutenção</h2>

            <div className="campo-form">
              <label>Ordem de serviço *</label>
              <select value={osId} onChange={(e) => selecionarOS(e.target.value)}>
                <option value="">Selecione...</option>
                {opcoes.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </div>

            {osId && osDetalheQuery.data && (
              <div
                style={{
                  background: 'var(--paper-50)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                <div>
                  <strong>Equipamento:</strong> {osDetalheQuery.data.optica_desc} ({osDetalheQuery.data.optica_fab})
                </div>
                <div className="mono">Nº série: {osDetalheQuery.data.optica_sn}</div>
                <div>
                  <strong>Defeito relatado:</strong> {osDetalheQuery.data.defeito_relatado || '-'}
                </div>
              </div>
            )}

            {osId && (
              <div className="campo-form">
                <label>Itens aprovados no orçamento (marque os que foram trocados)</label>
                {itensOrcamentoQuery.isLoading && <p style={{ fontSize: 12 }}>Carregando itens...</p>}
                {!itensOrcamentoQuery.isLoading && checklist.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                    Esta OS não tem itens de orçamento cadastrados.
                  </p>
                )}
                {checklist.map((item) => (
                  <div key={item.item_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={item.substituido}
                      onChange={() => alternarItem(item.item_id)}
                    />
                    <span style={{ fontSize: 13 }}>
                      {item.produto_nome} (qtd. {item.quantidade})
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="campo-form">
              <label>Data de início</label>
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="campo-form">
              <label>Data de fim (deixe em branco se ainda em andamento)</label>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <div className="campo-form">
              <label>Observações</label>
              <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setModalAberto(false)} disabled={salvando}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
