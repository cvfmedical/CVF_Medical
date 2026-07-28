import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { enviarArquivoStorage } from '../../lib/storage';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { IconTrash } from '@tabler/icons-react';

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
  const { opcoes: opcoesOS } = useOrdensServicoOpcoes();
  const [osId, setOsId] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [novoItem, setNovoItem] = useState({ produto_servico_id: '', quantidade: '1', observacao: '' });
  const [fotoItem, setFotoItem] = useState<File | null>(null);

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

  const itensQuery = useQuery({
    queryKey: ['itens-orcamento', orcamentoQuery.data?.id],
    enabled: !!orcamentoQuery.data?.id,
    queryFn: async (): Promise<ItemOrcamento[]> => {
      const { data, error } = await supabase
        .from('orcamento_itens')
        .select('id, produto_servico_id, quantidade, observacao')
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
        observacao: novoItem.observacao || null,
        foto_peca_danificada_path: fotoPath,
      });
      if (error) throw error;
      setNovoItem({ produto_servico_id: '', quantidade: '1', observacao: '' });
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
            <label>Observação</label>
            <input
              type="text"
              value={novoItem.observacao}
              onChange={(e) => setNovoItem((f) => ({ ...f, observacao: e.target.value }))}
            />
          </div>
          <div className="campo-form">
            <label>Foto da peça danificada (opcional)</label>
            <input type="file" accept="image/*" onChange={(e) => setFotoItem(e.target.files?.[0] ?? null)} />
          </div>

          {erro && <p className="erro-login">{erro}</p>}

          <button className="botao-primario botao-pequeno" onClick={adicionarItem}>
            Adicionar item
          </button>
        </div>
      )}
    </div>
  );
}
