import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { enviarArquivoStorage, excluirArquivoStorage, urlAssinadaFoto } from '../../lib/storage';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { CapturaFoto } from '../../components/CapturaFoto';
import { IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react';

interface ProdutoServico {
  id: number;
  codigo: string | null;
  nome: string;
  tipo: string | null;
  descricao: string | null;
  categoria: string | null;
  ncm: string | null;
  marca_fabricante: string | null;
  fornecedor_id: number | null;
  preco_custo: number | null;
  preco_unitario: number | null;
  unidade: string;
  codigo_barras: string | null;
  observacoes: string | null;
  status_ativo: boolean;
}

const PREFIXO_POR_TIPO: Record<string, string> = {
  Produto: 'PRD',
  Peça: 'PEC',
  Serviço: 'SRV',
};

async function gerarCodigo(tipo: string): Promise<string> {
  const prefixo = PREFIXO_POR_TIPO[tipo] ?? 'SKU';
  const { count } = await supabase
    .from('produtos_servicos')
    .select('id', { count: 'exact', head: true })
    .like('codigo', `${prefixo}-%`);
  return `${prefixo}-${String((count ?? 0) + 1).padStart(5, '0')}`;
}

const formVazio = {
  codigo: '',
  nome: '',
  tipo: 'Peça',
  descricao: '',
  categoria: '',
  marca_fabricante: '',
  fornecedor_id: '',
  ncm: '',
  codigo_barras: '',
  preco_custo: '',
  preco_unitario: '',
  unidade: 'un',
  observacoes: '',
  status_ativo: true,
};

export function ProdutosServicos() {
  const qc = useQueryClient();
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<ProdutoServico | null>(null);
  const [form, setForm] = useState(formVazio);
  const [filtro, setFiltro] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotosExistentes, setFotosExistentes] = useState<{ id: number; storage_path: string; url: string | null }[]>([]);

  const query = useQuery({
    queryKey: ['produtos-servicos'],
    queryFn: async (): Promise<ProdutoServico[]> => {
      const { data, error } = await supabase.from('produtos_servicos').select('*').order('nome');
      if (error) throw error;
      return data as ProdutoServico[];
    },
  });

  const fornecedoresQuery = useQuery({
    queryKey: ['fornecedores-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('id, razao_social').order('razao_social');
      if (error) throw error;
      return data as { id: number; razao_social: string }[];
    },
  });

  const categoriasQuery = useQuery({
    queryKey: ['categorias-produtos-servicos-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_produtos_servicos')
        .select('id, descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { id: number; descricao: string }[];
    },
  });

  function nomeFornecedor(id: number | null) {
    return id ? fornecedoresQuery.data?.find((f) => f.id === id)?.razao_social ?? `#${id}` : '-';
  }

  const linhas = (query.data ?? []).filter((p) => {
    if (!filtro.trim()) return true;
    const termo = filtro.trim().toLowerCase();
    return (
      p.nome.toLowerCase().includes(termo) ||
      (p.categoria ?? '').toLowerCase().includes(termo) ||
      (p.codigo ?? '').toLowerCase().includes(termo) ||
      (p.codigo_barras ?? '').toLowerCase().includes(termo)
    );
  });

  // Gera o código automaticamente conforme o tipo escolhido, só para
  // registros novos - ao editar, o código já existente nunca muda.
  useEffect(() => {
    if (editando || !modalAberto) return;
    gerarCodigo(form.tipo).then((codigo) => setForm((f) => ({ ...f, codigo })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tipo, editando, modalAberto]);

  function abrirNovo() {
    setEditando(null);
    setForm(formVazio);
    setFotos([]);
    setFotosExistentes([]);
    setErro(null);
    setModalAberto(true);
  }

  function abrirEdicao(p: ProdutoServico) {
    setEditando(p);
    setForm({
      codigo: p.codigo ?? '',
      nome: p.nome,
      tipo: p.tipo ?? 'Peça',
      descricao: p.descricao ?? '',
      categoria: p.categoria ?? '',
      marca_fabricante: p.marca_fabricante ?? '',
      fornecedor_id: p.fornecedor_id ? String(p.fornecedor_id) : '',
      ncm: p.ncm ?? '',
      codigo_barras: p.codigo_barras ?? '',
      preco_custo: p.preco_custo != null ? String(p.preco_custo) : '',
      preco_unitario: p.preco_unitario != null ? String(p.preco_unitario) : '',
      unidade: p.unidade ?? 'un',
      observacoes: p.observacoes ?? '',
      status_ativo: p.status_ativo,
    });
    setFotos([]);
    setErro(null);
    setModalAberto(true);
    carregarFotosExistentes(p.id);
  }

  async function carregarFotosExistentes(produtoId: number) {
    setFotosExistentes([]);
    const { data } = await supabase
      .from('fotos_produto_servico')
      .select('id, storage_path')
      .eq('produto_servico_id', produtoId);
    if (!data) return;
    const comUrl = await Promise.all(
      (data as { id: number; storage_path: string }[]).map(async (f) => ({
        ...f,
        url: await urlAssinadaFoto(f.storage_path),
      })),
    );
    setFotosExistentes(comUrl);
  }

  async function excluirFotoExistente(foto: { id: number; storage_path: string }) {
    if (!confirm('Excluir esta foto?')) return;
    const { error } = await supabase.from('fotos_produto_servico').delete().eq('id', foto.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    await excluirArquivoStorage(foto.storage_path);
    setFotosExistentes((lista) => lista.filter((f) => f.id !== foto.id));
  }

  function removerFotoSelecionada(indice: number) {
    setFotos((lista) => lista.filter((_, i) => i !== indice));
  }

  async function excluir(p: ProdutoServico) {
    if (!confirm(`Excluir "${p.nome}"?`)) return;
    const { error } = await supabase.from('produtos_servicos').delete().eq('id', p.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['produtos-servicos'] });
  }

  async function salvar() {
    setErro(null);
    if (!form.nome) {
      setErro('Informe o nome.');
      return;
    }
    if (!form.tipo) {
      setErro('Selecione o tipo.');
      return;
    }
    setSalvando(true);
    try {
      const dados = {
        codigo: form.codigo || null,
        nome: form.nome,
        tipo: form.tipo,
        descricao: form.descricao || null,
        categoria: form.categoria || null,
        marca_fabricante: form.marca_fabricante || null,
        fornecedor_id: form.fornecedor_id ? Number(form.fornecedor_id) : null,
        ncm: form.ncm || null,
        codigo_barras: form.codigo_barras || null,
        preco_custo: form.preco_custo ? Number(form.preco_custo) : null,
        preco_unitario: form.preco_unitario ? Number(form.preco_unitario) : null,
        unidade: form.unidade || 'un',
        observacoes: form.observacoes || null,
        status_ativo: form.status_ativo,
      };
      let produtoId: number;
      if (editando) {
        const { error } = await supabase.from('produtos_servicos').update(dados).eq('id', editando.id);
        if (error) throw error;
        produtoId = editando.id;
      } else {
        const { data: inserido, error } = await supabase.from('produtos_servicos').insert(dados).select('id').single();
        if (error) throw error;
        produtoId = inserido.id;
      }

      for (const foto of fotos) {
        const caminho = await enviarArquivoStorage(`produto_${produtoId}`, foto);
        await supabase.from('fotos_produto_servico').insert({ produto_servico_id: produtoId, storage_path: caminho });
      }

      setModalAberto(false);
      qc.invalidateQueries({ queryKey: ['produtos-servicos'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (query.isLoading || fornecedoresQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Produtos e serviços</h1>
        <button className="botao-primario botao-pequeno" onClick={abrirNovo}>
          <IconPlus size={16} /> Novo
        </button>
      </div>

      <input className="campo-filtro" placeholder="Buscar..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Categoria</th>
            <th>Marca/fabricante</th>
            <th>Preço de custo</th>
            <th>Preço de venda</th>
            <th>Unidade</th>
            <th>Fornecedor</th>
            <th>Ativo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.codigo}</td>
              <td>{p.nome}</td>
              <td>{p.tipo}</td>
              <td>{p.categoria}</td>
              <td>{p.marca_fabricante}</td>
              <td>{p.preco_custo != null ? `R$ ${Number(p.preco_custo).toFixed(2)}` : '-'}</td>
              <td>{p.preco_unitario != null ? `R$ ${Number(p.preco_unitario).toFixed(2)}` : '-'}</td>
              <td>{p.unidade}</td>
              <td>{nomeFornecedor(p.fornecedor_id)}</td>
              <td>
                <Badge tono={p.status_ativo ? 'teal' : 'neutro'}>{p.status_ativo ? 'Ativo' : 'Inativo'}</Badge>
              </td>
              <td className="acoes-tabela">
                <button className="botao-icone" title="Editar" onClick={() => abrirEdicao(p)}>
                  <IconPencil size={16} />
                </button>
                <button className="botao-icone perigo" title="Excluir" onClick={() => excluir(p)}>
                  <IconTrash size={16} />
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={11}>Nenhum registro encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <div className="modal-fundo" onClick={() => setModalAberto(false)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h2>{editando ? 'Editar' : 'Novo'}</h2>

            <div className="campo-form">
              <label>Código interno (SKU) - gerado automaticamente</label>
              <input type="text" value={form.codigo} disabled style={{ background: 'var(--paper-50)', color: 'var(--ink-400)' }} />
            </div>
            <div className="campo-form">
              <label>Tipo *</label>
              <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                <option value="Produto">Produto</option>
                <option value="Peça">Peça</option>
                <option value="Serviço">Serviço</option>
              </select>
            </div>
            <div className="campo-form">
              <label>Nome *</label>
              <input type="text" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>Descrição</label>
              <textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>Categoria</label>
              <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
                <option value="">Selecione...</option>
                {(categoriasQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.descricao}>
                    {c.descricao}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Não achou a categoria certa? Cadastre em "Categorias de produtos/serviços" (Cadastros Gerais).
              </p>
            </div>
            <div className="campo-form">
              <label>Marca/fabricante</label>
              <input
                type="text"
                value={form.marca_fabricante}
                onChange={(e) => setForm((f) => ({ ...f, marca_fabricante: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Fornecedor padrão</label>
              <select value={form.fornecedor_id} onChange={(e) => setForm((f) => ({ ...f, fornecedor_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {(fornecedoresQuery.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.razao_social}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo-form">
              <label>NCM (para nota fiscal)</label>
              <input type="text" value={form.ncm} onChange={(e) => setForm((f) => ({ ...f, ncm: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>Código de barras</label>
              <input
                type="text"
                value={form.codigo_barras}
                onChange={(e) => setForm((f) => ({ ...f, codigo_barras: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Preço de custo (R$)</label>
                <input
                  type="number"
                  value={form.preco_custo}
                  onChange={(e) => setForm((f) => ({ ...f, preco_custo: e.target.value }))}
                />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Preço de venda (R$)</label>
                <input
                  type="number"
                  value={form.preco_unitario}
                  onChange={(e) => setForm((f) => ({ ...f, preco_unitario: e.target.value }))}
                />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Unidade</label>
                <input type="text" value={form.unidade} onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))} />
              </div>
            </div>
            <div className="campo-form">
              <label>Observações</label>
              <textarea value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.status_ativo}
                  onChange={(e) => setForm((f) => ({ ...f, status_ativo: e.target.checked }))}
                />
                Ativo
              </label>
            </div>

            {fotosExistentes.length > 0 && (
              <div className="campo-form">
                <label>Fotos já salvas</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {fotosExistentes.map((f) => (
                    <div key={f.id} style={{ position: 'relative' }}>
                      {f.url && (
                        <img src={f.url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }} />
                      )}
                      <button
                        type="button"
                        className="botao-icone perigo"
                        title="Excluir foto"
                        style={{ position: 'absolute', top: -8, right: -8, background: 'var(--paper-0)', borderRadius: '50%' }}
                        onClick={() => excluirFotoExistente(f)}
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="campo-form">
              <label>Fotos (pode escolher várias ou tirar com a câmera)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setFotos((lista) => [...lista, ...Array.from(e.target.files ?? [])])}
                />
                <CapturaFoto onCapturar={(arquivo) => setFotos((lista) => [...lista, arquivo])} />
              </div>
              {fotos.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
                  {fotos.map((foto, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}>
                      <span>{foto.name}</span>
                      <button
                        type="button"
                        className="botao-icone perigo"
                        title="Remover"
                        onClick={() => removerFotoSelecionada(i)}
                      >
                        <IconX size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
