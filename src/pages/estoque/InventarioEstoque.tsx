import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';

interface ProdutoEstoque {
  id: number;
  codigo: string | null;
  nome: string;
  categoria: string | null;
  unidade: string;
  quantidade_estoque: number;
  estoque_minimo: number;
}

interface Movimentacao {
  id: number;
  tipo: 'Entrada' | 'Saída';
  quantidade: number;
  motivo: string | null;
  data_movimentacao: string;
}

export function InventarioEstoque() {
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState('');
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoEstoque | null>(null);
  const [modalMovimento, setModalMovimento] = useState(false);
  const [modalHistorico, setModalHistorico] = useState(false);
  const [modalMinimo, setModalMinimo] = useState(false);
  const [tipoMovimento, setTipoMovimento] = useState<'Entrada' | 'Saída'>('Entrada');
  const [quantidadeMovimento, setQuantidadeMovimento] = useState('1');
  const [motivoMovimento, setMotivoMovimento] = useState('');
  const [novoMinimo, setNovoMinimo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const query = useQuery({
    queryKey: ['produtos-estoque'],
    queryFn: async (): Promise<ProdutoEstoque[]> => {
      const { data, error } = await supabase
        .from('produtos_servicos')
        .select('id, codigo, nome, categoria, unidade, quantidade_estoque, estoque_minimo')
        .eq('status_ativo', true)
        .order('nome');
      if (error) throw error;
      return data as ProdutoEstoque[];
    },
  });

  const historicoQuery = useQuery({
    queryKey: ['historico-estoque', produtoSelecionado?.id],
    enabled: modalHistorico && !!produtoSelecionado,
    queryFn: async (): Promise<Movimentacao[]> => {
      const { data, error } = await supabase
        .from('movimentacoes_estoque')
        .select('id, tipo, quantidade, motivo, data_movimentacao')
        .eq('produto_servico_id', produtoSelecionado!.id)
        .order('data_movimentacao', { ascending: false });
      if (error) throw error;
      return data as Movimentacao[];
    },
  });

  const linhas = (query.data ?? []).filter((p) => {
    if (!filtro.trim()) return true;
    const termo = filtro.trim().toLowerCase();
    return p.nome.toLowerCase().includes(termo) || (p.codigo ?? '').toLowerCase().includes(termo);
  });

  function abrirMovimento(p: ProdutoEstoque) {
    setProdutoSelecionado(p);
    setTipoMovimento('Entrada');
    setQuantidadeMovimento('1');
    setMotivoMovimento('');
    setErro(null);
    setModalMovimento(true);
  }

  function abrirHistorico(p: ProdutoEstoque) {
    setProdutoSelecionado(p);
    setModalHistorico(true);
  }

  function abrirMinimo(p: ProdutoEstoque) {
    setProdutoSelecionado(p);
    setNovoMinimo(String(p.estoque_minimo));
    setErro(null);
    setModalMinimo(true);
  }

  async function registrarMovimento() {
    if (!produtoSelecionado) return;
    setErro(null);
    const quantidade = Number(quantidadeMovimento);
    if (!quantidade || quantidade <= 0) {
      setErro('Informe uma quantidade válida.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from('movimentacoes_estoque').insert({
        produto_servico_id: produtoSelecionado.id,
        tipo: tipoMovimento,
        quantidade,
        motivo: motivoMovimento || null,
        responsavel_id: funcionario?.id ?? null,
      });
      if (error) throw error;
      setModalMovimento(false);
      qc.invalidateQueries({ queryKey: ['produtos-estoque'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function salvarMinimo() {
    if (!produtoSelecionado) return;
    setErro(null);
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('produtos_servicos')
        .update({ estoque_minimo: Number(novoMinimo) || 0 })
        .eq('id', produtoSelecionado.id);
      if (error) throw error;
      setModalMinimo(false);
      qc.invalidateQueries({ queryKey: ['produtos-estoque'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <h1>Inventário de peças</h1>
      <input className="campo-filtro" placeholder="Buscar..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Categoria</th>
            <th>Estoque atual</th>
            <th>Estoque mínimo</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.codigo}</td>
              <td>{p.nome}</td>
              <td>{p.categoria}</td>
              <td>
                {p.quantidade_estoque} {p.unidade}
              </td>
              <td>
                {p.estoque_minimo} {p.unidade}
              </td>
              <td>
                {p.estoque_minimo > 0 && p.quantidade_estoque <= p.estoque_minimo ? (
                  <Badge tono="danger">Baixo estoque</Badge>
                ) : (
                  <Badge tono="teal">OK</Badge>
                )}
              </td>
              <td className="acoes-tabela">
                <button className="botao-secundario" onClick={() => abrirMovimento(p)}>
                  Movimentar
                </button>
                <button className="botao-secundario" onClick={() => abrirHistorico(p)}>
                  Histórico
                </button>
                <button className="botao-secundario" onClick={() => abrirMinimo(p)}>
                  Mínimo
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhum registro encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalMovimento && produtoSelecionado && (
        <div className="modal-fundo" onClick={() => setModalMovimento(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Movimentar estoque - {produtoSelecionado.nome}</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
              Estoque atual: {produtoSelecionado.quantidade_estoque} {produtoSelecionado.unidade}
            </p>
            <div className="campo-form">
              <label>Tipo</label>
              <select value={tipoMovimento} onChange={(e) => setTipoMovimento(e.target.value as 'Entrada' | 'Saída')}>
                <option value="Entrada">Entrada</option>
                <option value="Saída">Saída</option>
              </select>
            </div>
            <div className="campo-form">
              <label>Quantidade</label>
              <input type="number" value={quantidadeMovimento} onChange={(e) => setQuantidadeMovimento(e.target.value)} />
            </div>
            <div className="campo-form">
              <label>Motivo</label>
              <textarea value={motivoMovimento} onChange={(e) => setMotivoMovimento(e.target.value)} />
            </div>

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setModalMovimento(false)} disabled={salvando}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={registrarMovimento} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalHistorico && produtoSelecionado && (
        <div className="modal-fundo" onClick={() => setModalHistorico(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Histórico - {produtoSelecionado.nome}</h2>
            <table className="tabela-crud">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Qtd.</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {(historicoQuery.data ?? []).map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.data_movimentacao).toLocaleString('pt-BR')}</td>
                    <td>
                      <Badge tono={m.tipo === 'Entrada' ? 'teal' : 'copper'}>{m.tipo}</Badge>
                    </td>
                    <td>{m.quantidade}</td>
                    <td>{m.motivo || '-'}</td>
                  </tr>
                ))}
                {(historicoQuery.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4}>Nenhuma movimentação registrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setModalHistorico(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMinimo && produtoSelecionado && (
        <div className="modal-fundo" onClick={() => setModalMinimo(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Estoque mínimo - {produtoSelecionado.nome}</h2>
            <div className="campo-form">
              <label>Quantidade mínima</label>
              <input type="number" value={novoMinimo} onChange={(e) => setNovoMinimo(e.target.value)} />
            </div>

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setModalMinimo(false)} disabled={salvando}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={salvarMinimo} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
