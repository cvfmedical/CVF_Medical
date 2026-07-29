import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { enviarArquivoStorage, urlAssinadaFoto } from '../../lib/storage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { IconPhoto, IconTrash } from '@tabler/icons-react';

interface Orcamento {
  id: number;
  numero_orcamento: string;
  status: string;
  observacoes_tecnico: string | null;
}

interface ItemOrcamento {
  id: number;
  produto_servico_id: number | null;
  quantidade: number;
  observacao: string | null;
  foto_peca_danificada_path: string | null;
}

async function gerarNumeroOrcamento(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from('orcamentos')
    .select('id', { count: 'exact', head: true })
    .like('numero_orcamento', `ORC-${hoje}-%`);
  return `ORC-${hoje}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

export function OrcamentoTecnico() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { opcoes: opcoesOS } = useOrdensServicoOpcoes();
  const [osId, setOsId] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [novoItem, setNovoItem] = useState({ produto_servico_id: '', quantidade: '1' });
  const [observacaoParaAdicionar, setObservacaoParaAdicionar] = useState('');
  const [observacoesSelecionadas, setObservacoesSelecionadas] = useState<string[]>([]);
  const [fotoItem, setFotoItem] = useState<File | null>(null);

  // Pré-seleciona a OS quando vem de "Converter em OS" (Entrada do Equipamento).
  useEffect(() => {
    const osParam = searchParams.get('os');
    if (osParam) setOsId(osParam);
  }, [searchParams]);

  const orcamentoQuery = useQuery({
    queryKey: ['orcamento-por-os', osId],
    enabled: !!osId,
    queryFn: async (): Promise<Orcamento | null> => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('id, numero_orcamento, status, observacoes_tecnico')
        .eq('ordem_servico_id', Number(osId))
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Orcamento | null;
    },
  });

  const produtosQuery = useQuery({
    queryKey: ['produtos-servicos-opcoes'],
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

  const observacoesQuery = useQuery({
    queryKey: ['observacoes-defeito-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('observacoes_defeito')
        .select('id, descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { id: number; descricao: string }[];
    },
  });

  const itensQuery = useQuery({
    queryKey: ['itens-orcamento', orcamentoQuery.data?.id],
    enabled: !!orcamentoQuery.data?.id,
    queryFn: async (): Promise<ItemOrcamento[]> => {
      const { data, error } = await supabase
        .from('orcamento_itens')
        .select('id, produto_servico_id, quantidade, observacao, foto_peca_danificada_path')
        .eq('orcamento_id', orcamentoQuery.data!.id);
      if (error) throw error;
      return data as ItemOrcamento[];
    },
  });

  async function criarOrcamento() {
    setErro(null);
    setCriando(true);
    try {
      const numero = await gerarNumeroOrcamento();
      const { error } = await supabase.from('orcamentos').insert({
        numero_orcamento: numero,
        ordem_servico_id: Number(osId),
        status: 'Aguardando Precificação',
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['orcamento-por-os', osId] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCriando(false);
    }
  }

  function adicionarObservacaoNaLista() {
    if (!observacaoParaAdicionar) return;
    setObservacoesSelecionadas((lista) =>
      lista.includes(observacaoParaAdicionar) ? lista : [...lista, observacaoParaAdicionar],
    );
    setObservacaoParaAdicionar('');
  }

  function removerObservacaoDaLista(descricao: string) {
    setObservacoesSelecionadas((lista) => lista.filter((o) => o !== descricao));
  }

  async function adicionarItem() {
    if (!orcamentoQuery.data || !novoItem.produto_servico_id) return;
    setErro(null);
    try {
      let fotoPath: string | null = null;
      if (fotoItem) {
        fotoPath = await enviarArquivoStorage(`orcamento_${orcamentoQuery.data.id}`, fotoItem);
      }
      const { error } = await supabase.from('orcamento_itens').insert({
        orcamento_id: orcamentoQuery.data.id,
        produto_servico_id: Number(novoItem.produto_servico_id),
        quantidade: Number(novoItem.quantidade) || 1,
        observacao: observacoesSelecionadas.length ? observacoesSelecionadas.join('; ') : null,
        foto_peca_danificada_path: fotoPath,
      });
      if (error) throw error;
      setNovoItem({ produto_servico_id: '', quantidade: '1' });
      setObservacoesSelecionadas([]);
      setObservacaoParaAdicionar('');
      setFotoItem(null);
      qc.invalidateQueries({ queryKey: ['itens-orcamento', orcamentoQuery.data.id] });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function excluirItem(itemId: number) {
    if (!confirm('Remover este item?')) return;
    const { error } = await supabase.from('orcamento_itens').delete().eq('id', itemId);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['itens-orcamento', orcamentoQuery.data?.id] });
  }

  async function verFoto(caminho: string | null) {
    if (!caminho) return;
    const url = await urlAssinadaFoto(caminho);
    if (url) window.open(url, '_blank');
  }

  async function finalizar() {
    if (!osId) return;
    setFinalizando(true);
    try {
      const { error } = await supabase
        .from('ordens_servico')
        .update({ status_os: '2. AGUARDANDO ORÇAMENTO' })
        .eq('id', Number(osId));
      if (error) throw error;
      navigate('/ordens-servico');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setFinalizando(false);
    }
  }

  function nomeProduto(id: number | null) {
    return produtosQuery.data?.find((p) => p.id === id)?.nome ?? '-';
  }

  return (
    <div>
      <h1>Montar orçamento (técnico)</h1>

      <div className="campo-form" style={{ maxWidth: 420 }}>
        <label>Ordem de serviço</label>
        <select value={osId} onChange={(e) => setOsId(e.target.value)}>
          <option value="">Selecione...</option>
          {opcoesOS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      </div>

      {osId && orcamentoQuery.isLoading && <CarregandoTela />}

      {osId && !orcamentoQuery.isLoading && !orcamentoQuery.data && (
        <div>
          <p>Esta OS ainda não tem orçamento montado.</p>
          <button className="botao-primario botao-pequeno" onClick={criarOrcamento} disabled={criando}>
            {criando ? 'Criando...' : 'Criar orçamento'}
          </button>
        </div>
      )}

      {orcamentoQuery.data && (
        <div>
          <p className="mono" style={{ color: 'var(--ink-400)' }}>
            {orcamentoQuery.data.numero_orcamento} — {orcamentoQuery.data.status}
          </p>

          <table className="tabela-crud">
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantidade</th>
                <th>Observação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(itensQuery.data ?? []).map((item) => (
                <tr key={item.id}>
                  <td>{nomeProduto(item.produto_servico_id)}</td>
                  <td>{item.quantidade}</td>
                  <td>{item.observacao}</td>
                  <td className="acoes-tabela">
                    {item.foto_peca_danificada_path && (
                      <button className="botao-icone" title="Ver foto" onClick={() => verFoto(item.foto_peca_danificada_path)}>
                        <IconPhoto size={16} />
                      </button>
                    )}
                    <button className="botao-icone perigo" title="Remover" onClick={() => excluirItem(item.id)}>
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {(itensQuery.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4}>Nenhum item adicionado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>

          <h2 style={{ marginTop: 20 }}>Adicionar item</h2>
          <div className="campo-form">
            <label>Produto/serviço</label>
            <select
              value={novoItem.produto_servico_id}
              onChange={(e) => setNovoItem((f) => ({ ...f, produto_servico_id: e.target.value }))}
            >
              <option value="">Selecione...</option>
              {(produtosQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo-form">
            <label>Quantidade</label>
            <input
              type="number"
              value={novoItem.quantidade}
              onChange={(e) => setNovoItem((f) => ({ ...f, quantidade: e.target.value }))}
            />
          </div>
          <div className="campo-form">
            <label>Observação (defeito identificado) - pode adicionar mais de um</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                style={{ flex: 1 }}
                value={observacaoParaAdicionar}
                onChange={(e) => setObservacaoParaAdicionar(e.target.value)}
              >
                <option value="">Selecione...</option>
                {(observacoesQuery.data ?? [])
                  .filter((o) => !observacoesSelecionadas.includes(o.descricao))
                  .map((o) => (
                    <option key={o.id} value={o.descricao}>
                      {o.descricao}
                    </option>
                  ))}
              </select>
              <button type="button" className="botao-secundario" onClick={adicionarObservacaoNaLista}>
                Adicionar
              </button>
            </div>
            {observacoesSelecionadas.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {observacoesSelecionadas.map((descricao) => (
                  <span
                    key={descricao}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--paper-50)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: 12,
                    }}
                  >
                    {descricao}
                    <button
                      type="button"
                      className="botao-icone perigo"
                      title="Remover"
                      onClick={() => removerObservacaoDaLista(descricao)}
                    >
                      <IconTrash size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
              Não achou a observação certa? Cadastre em "Observações de defeito" (Cadastros Gerais).
            </p>
          </div>
          <div className="campo-form">
            <label>Foto da peça danificada (opcional)</label>
            <input type="file" accept="image/*" onChange={(e) => setFotoItem(e.target.files?.[0] ?? null)} />
          </div>

          {erro && <p className="erro-login">{erro}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="botao-primario botao-pequeno" onClick={adicionarItem}>
              Adicionar item
            </button>
            <button className="botao-secundario" onClick={finalizar} disabled={finalizando}>
              {finalizando ? 'Finalizando...' : 'Finalizar identificação de danos'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
