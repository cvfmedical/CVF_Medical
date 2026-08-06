import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { enviarArquivoStorage, excluirArquivoStorage, urlAssinadaFoto } from '../../lib/storage';
import { useAuth } from '../../contexts/AuthContext';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { IconEye, IconPencil, IconPlus, IconPrinter, IconShare, IconTrash, IconX } from '@tabler/icons-react';
import { CHECKLIST_AVARIAS, type ChecklistAvarias } from '../../lib/checklistAvarias';
import { imprimirRegistroEntrada } from '../../lib/relatorioEntrada';
import { linkEmail, linkWhatsApp, PORTAL_CLIENTE_URL } from '../../lib/compartilhar';
import { CapturaFoto } from '../../components/CapturaFoto';

interface Entrada {
  id: number;
  codigo_entrada: string;
  cliente_id: number;
  equipamento_desc: string | null;
  equipamento_fab: string | null;
  equipamento_sn: string | null;
  defeito_relatado: string | null;
  condicao_chegada: string | null;
  status: string;
  ordem_servico_id: number | null;
  data_entrada: string;
  triagem_avarias: ChecklistAvarias | null;
  nf_remessa_numero: string | null;
  nf_remessa_serie: string | null;
  nf_remessa_chave_acesso: string | null;
  nf_remessa_cfop: string | null;
  nf_remessa_data_emissao: string | null;
  nf_remessa_valor: number | null;
  numero_controle_cliente: string | null;
}

interface FotoEntrada {
  id: number;
  storage_path: string;
  descricao: string | null;
}

interface CatalogoOtica {
  id: number;
  fabricante: string;
  modelo: string;
  tipo: string | null;
  diametro_mm: number | null;
  angulo_graus: number | null;
}

interface Cliente {
  id: number;
  razao_social: string;
  telefone: string | null;
  email: string | null;
}

async function gerarCodigoEntrada(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from('entradas_equipamento')
    .select('id', { count: 'exact', head: true })
    .like('codigo_entrada', `ENT-${hoje}-%`);
  return `ENT-${hoje}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

async function gerarNumeroOS(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { count } = await supabase
    .from('ordens_servico')
    .select('id', { count: 'exact', head: true })
    .like('numero_os', `OS-${hoje}-%`);
  return `OS-${hoje}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

const formVazio = {
  cliente_id: '',
  equipamento_desc: '',
  equipamento_fab: '',
  equipamento_sn: '',
  defeito_relatado: '',
  nf_remessa_numero: '',
  nf_remessa_serie: '',
  nf_remessa_chave_acesso: '',
  nf_remessa_cfop: '',
  nf_remessa_data_emissao: '',
  nf_remessa_valor: '',
  numero_controle_cliente: '',
};

export function EntradaEquipamento() {
  const { funcionario } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Entrada | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [form, setForm] = useState(formVazio);
  const [avarias, setAvarias] = useState<ChecklistAvarias>({});
  const [convertendo, setConvertendo] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Entrada | null>(null);
  const [fotosDetalhe, setFotosDetalhe] = useState<{ id: number; url: string | null }[]>([]);
  const [condicaoParaAdicionar, setCondicaoParaAdicionar] = useState('');
  const [condicoesSelecionadas, setCondicoesSelecionadas] = useState<string[]>([]);
  const [fotosExistentes, setFotosExistentes] = useState<{ id: number; storage_path: string; url: string | null }[]>([]);

  const condicoesChegadaQuery = useQuery({
    queryKey: ['condicoes-chegada-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('condicoes_chegada')
        .select('id, descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { id: number; descricao: string }[];
    },
  });

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-completo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social, telefone, email').order('razao_social');
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const catalogoQuery = useQuery({
    queryKey: ['catalogo-oticas-opcoes'],
    queryFn: async (): Promise<CatalogoOtica[]> => {
      const { data, error } = await supabase
        .from('catalogo_oticas')
        .select('id, fabricante, modelo, tipo, diametro_mm, angulo_graus')
        .order('fabricante');
      if (error) throw error;
      return data as CatalogoOtica[];
    },
  });

  function preencherDoCatalogo(catalogoId: string) {
    const item = catalogoQuery.data?.find((c) => String(c.id) === catalogoId);
    if (!item) return;
    const partes = [item.tipo, item.diametro_mm ? `${item.diametro_mm}mm` : null, item.angulo_graus != null ? `${item.angulo_graus}°` : null];
    const descricao = partes.filter(Boolean).join(' ');
    setForm((f) => ({ ...f, equipamento_fab: item.fabricante, equipamento_desc: descricao || item.modelo }));
  }

  const entradasQuery = useQuery({
    queryKey: ['entradas_equipamento'],
    queryFn: async (): Promise<Entrada[]> => {
      const { data, error } = await supabase
        .from('entradas_equipamento')
        .select('*')
        .order('data_entrada', { ascending: false });
      if (error) throw error;
      return data as Entrada[];
    },
  });

  function cliente(id: number) {
    return clientesQuery.data?.find((c) => c.id === id);
  }

  function abrirNova() {
    setEditando(null);
    setForm(formVazio);
    setAvarias({});
    setFotos([]);
    setFotosExistentes([]);
    setCondicoesSelecionadas([]);
    setCondicaoParaAdicionar('');
    setErro(null);
    setModalAberto(true);
  }

  function adicionarCondicaoNaLista() {
    if (!condicaoParaAdicionar) return;
    setCondicoesSelecionadas((lista) =>
      lista.includes(condicaoParaAdicionar) ? lista : [...lista, condicaoParaAdicionar],
    );
    setCondicaoParaAdicionar('');
  }

  function removerCondicaoDaLista(descricao: string) {
    setCondicoesSelecionadas((lista) => lista.filter((c) => c !== descricao));
  }

  function removerFotoSelecionada(indice: number) {
    setFotos((lista) => lista.filter((_, i) => i !== indice));
  }

  function abrirEdicao(e: Entrada) {
    setEditando(e);
    setForm({
      cliente_id: String(e.cliente_id),
      equipamento_desc: e.equipamento_desc ?? '',
      equipamento_fab: e.equipamento_fab ?? '',
      equipamento_sn: e.equipamento_sn ?? '',
      defeito_relatado: e.defeito_relatado ?? '',
      nf_remessa_numero: e.nf_remessa_numero ?? '',
      nf_remessa_serie: e.nf_remessa_serie ?? '',
      nf_remessa_chave_acesso: e.nf_remessa_chave_acesso ?? '',
      nf_remessa_cfop: e.nf_remessa_cfop ?? '',
      nf_remessa_data_emissao: e.nf_remessa_data_emissao ?? '',
      nf_remessa_valor: e.nf_remessa_valor != null ? String(e.nf_remessa_valor) : '',
      numero_controle_cliente: e.numero_controle_cliente ?? '',
    });
    setAvarias(e.triagem_avarias ?? {});
    setFotos([]);
    setCondicoesSelecionadas(e.condicao_chegada ? e.condicao_chegada.split('; ').filter(Boolean) : []);
    setCondicaoParaAdicionar('');
    setErro(null);
    setModalAberto(true);
    carregarFotosExistentes(e.id);
  }

  async function carregarFotosExistentes(entradaId: number) {
    setFotosExistentes([]);
    const { data } = await supabase
      .from('fotos_entrada')
      .select('id, storage_path')
      .eq('entrada_id', entradaId);
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
    const { error } = await supabase.from('fotos_entrada').delete().eq('id', foto.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    await excluirArquivoStorage(foto.storage_path);
    setFotosExistentes((lista) => lista.filter((f) => f.id !== foto.id));
  }

  async function excluir(e: Entrada) {
    if (!confirm(`Excluir a entrada ${e.codigo_entrada}?`)) return;
    const { error } = await supabase.from('entradas_equipamento').delete().eq('id', e.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['entradas_equipamento'] });
  }

  async function salvar() {
    setErro(null);
    if (!form.cliente_id) {
      setErro('Selecione o cliente.');
      return;
    }
    setSalvando(true);
    try {
      const camposComuns = {
        cliente_id: Number(form.cliente_id),
        equipamento_desc: form.equipamento_desc || null,
        equipamento_fab: form.equipamento_fab || null,
        equipamento_sn: form.equipamento_sn || null,
        defeito_relatado: form.defeito_relatado || null,
        condicao_chegada: condicoesSelecionadas.length ? condicoesSelecionadas.join('; ') : null,
        triagem_avarias: avarias,
        nf_remessa_numero: form.nf_remessa_numero || null,
        nf_remessa_serie: form.nf_remessa_serie || null,
        nf_remessa_chave_acesso: form.nf_remessa_chave_acesso || null,
        nf_remessa_cfop: form.nf_remessa_cfop || null,
        nf_remessa_data_emissao: form.nf_remessa_data_emissao || null,
        nf_remessa_valor: form.nf_remessa_valor ? Number(form.nf_remessa_valor) : null,
        numero_controle_cliente: form.numero_controle_cliente || null,
      };

      if (editando) {
        const { error } = await supabase.from('entradas_equipamento').update(camposComuns).eq('id', editando.id);
        if (error) throw error;

        for (const foto of fotos) {
          const caminho = await enviarArquivoStorage(`entrada_${editando.id}`, foto);
          await supabase.from('fotos_entrada').insert({ entrada_id: editando.id, storage_path: caminho });
        }
      } else {
        const codigo = await gerarCodigoEntrada();
        const { data: inserida, error } = await supabase
          .from('entradas_equipamento')
          .insert({
            codigo_entrada: codigo,
            ...camposComuns,
            recebido_por: funcionario?.id ?? null,
          })
          .select('id')
          .single();
        if (error) throw error;

        for (const foto of fotos) {
          const caminho = await enviarArquivoStorage(`entrada_${inserida.id}`, foto);
          await supabase.from('fotos_entrada').insert({ entrada_id: inserida.id, storage_path: caminho });
        }
      }

      setModalAberto(false);
      qc.invalidateQueries({ queryKey: ['entradas_equipamento'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function abrirDetalhe(entrada: Entrada) {
    setDetalhe(entrada);
    setFotosDetalhe([]);
    const { data: fotosEntrada } = await supabase
      .from('fotos_entrada')
      .select('id, storage_path')
      .eq('entrada_id', entrada.id);
    if (fotosEntrada) {
      const comUrl = await Promise.all(
        (fotosEntrada as { id: number; storage_path: string }[]).map(async (f) => ({
          id: f.id,
          url: await urlAssinadaFoto(f.storage_path),
        })),
      );
      setFotosDetalhe(comUrl);
    }
  }

  async function converterEmOS(entrada: Entrada) {
    if (entrada.ordem_servico_id) return;
    setConvertendo(entrada.id);
    try {
      const c = cliente(entrada.cliente_id);
      const numeroOS = await gerarNumeroOS();
      const { data: os, error } = await supabase
        .from('ordens_servico')
        .insert({
          numero_os: numeroOS,
          cliente_id: entrada.cliente_id,
          cliente_nome: c?.razao_social ?? '',
          optica_desc: entrada.equipamento_desc,
          optica_fab: entrada.equipamento_fab,
          optica_sn: entrada.equipamento_sn,
          defeito_relatado: entrada.defeito_relatado,
          status_os: '1. TRIAGEM / RECEBIMENTO',
          triagem_avarias: entrada.triagem_avarias ?? {},
        })
        .select('id')
        .single();
      if (error) throw error;

      await supabase
        .from('entradas_equipamento')
        .update({ ordem_servico_id: os.id, status: 'Convertida em OS' })
        .eq('id', entrada.id);

      qc.invalidateQueries({ queryKey: ['entradas_equipamento'] });
      navigate(`/registro-entrada?os=${os.id}`);
    } catch (e) {
      alert(mensagemErro(e));
    } finally {
      setConvertendo(null);
    }
  }

  async function imprimirRelatorio(entrada: Entrada) {
    const c = cliente(entrada.cliente_id);
    const { data: fotosEntrada } = await supabase
      .from('fotos_entrada')
      .select('id, storage_path, descricao')
      .eq('entrada_id', entrada.id);

    const incluirFotos = confirm('Incluir as fotos no relatório impresso? (Cancelar = só os dados, sem fotos)');
    let urls: string[] = [];
    if (incluirFotos && fotosEntrada?.length) {
      const urlsBrutas = await Promise.all(
        (fotosEntrada as FotoEntrada[]).map((f) => urlAssinadaFoto(f.storage_path)),
      );
      urls = urlsBrutas.filter((u): u is string => !!u);
    }

    imprimirRegistroEntrada(c, entrada, urls);
  }

  function compartilharLink(entrada: Entrada) {
    const c = cliente(entrada.cliente_id);
    const mensagem = `Olá! Recebemos o equipamento ${entrada.equipamento_desc ?? ''} (entrada ${entrada.codigo_entrada}). Acompanhe o andamento no portal do cliente: ${PORTAL_CLIENTE_URL}`;
    const escolha = confirm('OK = WhatsApp | Cancelar = E-mail');
    if (escolha) {
      window.open(linkWhatsApp(c?.telefone, mensagem), '_blank');
    } else {
      window.open(linkEmail(c?.email, `Q-CVF Medical - Entrada ${entrada.codigo_entrada}`, mensagem), '_blank');
    }
  }

  if (entradasQuery.isLoading || clientesQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Entrada do equipamento</h1>
        <button className="botao-primario botao-pequeno" onClick={abrirNova}>
          <IconPlus size={16} /> Nova entrada
        </button>
      </div>

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Código</th>
            <th>Cliente</th>
            <th>Equipamento</th>
            <th>Nº de série</th>
            <th>NF remessa</th>
            <th>Status</th>
            <th>Data</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(entradasQuery.data ?? []).map((e) => (
            <tr key={e.id}>
              <td className="mono">{e.codigo_entrada}</td>
              <td>{cliente(e.cliente_id)?.razao_social}</td>
              <td>{e.equipamento_desc}</td>
              <td className="mono">{e.equipamento_sn}</td>
              <td className="mono">{e.nf_remessa_numero || e.numero_controle_cliente || '-'}</td>
              <td>
                <Badge tono={e.ordem_servico_id ? 'teal' : 'copper'}>
                  {e.ordem_servico_id ? 'Convertida em OS' : e.status}
                </Badge>
              </td>
              <td>{new Date(e.data_entrada).toLocaleDateString('pt-BR')}</td>
              <td className="acoes-tabela">
                <button className="botao-icone" title="Ver entrada" onClick={() => abrirDetalhe(e)}>
                  <IconEye size={16} />
                </button>
                <button className="botao-icone" title="Editar" onClick={() => abrirEdicao(e)}>
                  <IconPencil size={16} />
                </button>
                <button className="botao-icone" title="Imprimir relatório" onClick={() => imprimirRelatorio(e)}>
                  <IconPrinter size={16} />
                </button>
                <button className="botao-icone" title="Enviar link ao cliente" onClick={() => compartilharLink(e)}>
                  <IconShare size={16} />
                </button>
                <button className="botao-icone perigo" title="Excluir" onClick={() => excluir(e)}>
                  <IconTrash size={16} />
                </button>
                {!e.ordem_servico_id && (
                  <button
                    className="botao-secundario"
                    style={{ marginLeft: 6 }}
                    disabled={convertendo === e.id}
                    onClick={() => converterEmOS(e)}
                  >
                    {convertendo === e.id ? 'Convertendo...' : 'Converter em OS'}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {(entradasQuery.data ?? []).length === 0 && (
            <tr>
              <td colSpan={8}>Nenhum registro encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <div className="modal-fundo" onClick={() => setModalAberto(false)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h2>{editando ? `Editar entrada ${editando.codigo_entrada}` : 'Nova entrada'}</h2>

            <div className="campo-form">
              <label>Cliente *</label>
              <select value={form.cliente_id} onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {(clientesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razao_social}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo-form">
              <label>Selecionar do catálogo de óticas (opcional)</label>
              <select defaultValue="" onChange={(e) => preencherDoCatalogo(e.target.value)}>
                <option value="">Preencher manualmente...</option>
                {(catalogoQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fabricante} - {c.modelo} {c.tipo ? `(${c.tipo})` : ''}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Preenche descrição e fabricante abaixo - o número de série e o resto continuam manuais.
              </p>
            </div>
            <div className="campo-form">
              <label>Descrição do equipamento</label>
              <input
                type="text"
                value={form.equipamento_desc}
                onChange={(e) => setForm((f) => ({ ...f, equipamento_desc: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Fabricante</label>
              <input
                type="text"
                value={form.equipamento_fab}
                onChange={(e) => setForm((f) => ({ ...f, equipamento_fab: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Número de série</label>
              <input
                type="text"
                value={form.equipamento_sn}
                onChange={(e) => setForm((f) => ({ ...f, equipamento_sn: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Defeito relatado</label>
              <textarea
                value={form.defeito_relatado}
                onChange={(e) => setForm((f) => ({ ...f, defeito_relatado: e.target.value }))}
              />
            </div>
            <div className="campo-form">
              <label>Condição de chegada - pode adicionar mais de uma</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  style={{ flex: 1 }}
                  value={condicaoParaAdicionar}
                  onChange={(e) => setCondicaoParaAdicionar(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {(condicoesChegadaQuery.data ?? [])
                    .filter((c) => !condicoesSelecionadas.includes(c.descricao))
                    .map((c) => (
                      <option key={c.id} value={c.descricao}>
                        {c.descricao}
                      </option>
                    ))}
                </select>
                <button type="button" className="botao-secundario" onClick={adicionarCondicaoNaLista}>
                  Adicionar
                </button>
              </div>
              {condicoesSelecionadas.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {condicoesSelecionadas.map((descricao) => (
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
                        onClick={() => removerCondicaoDaLista(descricao)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Não achou a condição certa? Cadastre em "Condições de chegada" (Cadastros Gerais).
              </p>
            </div>

            <h2 style={{ fontSize: 14, marginTop: 20 }}>Nota fiscal de remessa para conserto</h2>
            <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: -8, marginBottom: 8 }}>
              Dados da NF-e emitida pelo cliente para o envio do equipamento (CFOP 5915/6915) - controle interno,
              não emite nota fiscal de verdade.
            </p>
            <div className="campo-form">
              <label>Nº de controle interno do cliente (quando não há NF-e)</label>
              <input
                type="text"
                placeholder="Ex: OS 4521"
                value={form.numero_controle_cliente}
                onChange={(e) => setForm((f) => ({ ...f, numero_controle_cliente: e.target.value }))}
              />
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Alguns clientes enviam o equipamento só com um documento de controle interno deles, sem NF-e -
                use "Data de emissão" abaixo para a data desse documento.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Número</label>
                <input
                  type="text"
                  value={form.nf_remessa_numero}
                  onChange={(e) => setForm((f) => ({ ...f, nf_remessa_numero: e.target.value }))}
                />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Série</label>
                <input
                  type="text"
                  value={form.nf_remessa_serie}
                  onChange={(e) => setForm((f) => ({ ...f, nf_remessa_serie: e.target.value }))}
                />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>CFOP</label>
                <input
                  type="text"
                  placeholder="5915/6915"
                  value={form.nf_remessa_cfop}
                  onChange={(e) => setForm((f) => ({ ...f, nf_remessa_cfop: e.target.value }))}
                />
              </div>
            </div>
            <div className="campo-form">
              <label>Chave de acesso</label>
              <input
                type="text"
                maxLength={44}
                value={form.nf_remessa_chave_acesso}
                onChange={(e) => setForm((f) => ({ ...f, nf_remessa_chave_acesso: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Data de emissão</label>
                <input
                  type="date"
                  value={form.nf_remessa_data_emissao}
                  onChange={(e) => setForm((f) => ({ ...f, nf_remessa_data_emissao: e.target.value }))}
                />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Valor (R$)</label>
                <input
                  type="number"
                  value={form.nf_remessa_valor}
                  onChange={(e) => setForm((f) => ({ ...f, nf_remessa_valor: e.target.value }))}
                />
              </div>
            </div>

            <div className="campo-form">
              <label>Checklist de avarias identificadas na triagem</label>
              {CHECKLIST_AVARIAS.map((item) => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(avarias[item.key])}
                    onChange={(e) => setAvarias((a) => ({ ...a, [item.key]: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13 }}>{item.label}</span>
                </div>
              ))}
            </div>

            {fotosExistentes.length > 0 && (
              <div className="campo-form">
                <label>Fotos já salvas</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {fotosExistentes.map((f) => (
                    <div key={f.id} style={{ position: 'relative' }}>
                      {f.url && (
                        <img
                          src={f.url}
                          alt=""
                          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }}
                        />
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

      {detalhe && (
        <div className="modal-fundo" onClick={() => setDetalhe(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>{detalhe.codigo_entrada}</h2>
            <div className="campo-form">
              <label>Cliente</label>
              <p>{cliente(detalhe.cliente_id)?.razao_social}</p>
            </div>
            <div className="campo-form">
              <label>Equipamento</label>
              <p>
                {detalhe.equipamento_desc} ({detalhe.equipamento_fab}) - <span className="mono">{detalhe.equipamento_sn}</span>
              </p>
            </div>
            <div className="campo-form">
              <label>Defeito relatado</label>
              <p>{detalhe.defeito_relatado || '-'}</p>
            </div>
            <div className="campo-form">
              <label>Condição de chegada</label>
              <p>{detalhe.condicao_chegada || '-'}</p>
            </div>
            <div className="campo-form">
              <label>Nota fiscal de remessa</label>
              <p className="mono">
                {detalhe.nf_remessa_numero ?? '-'} / {detalhe.nf_remessa_serie ?? '-'}
              </p>
            </div>
            <div className="campo-form">
              <label>Avarias identificadas na triagem</label>
              {CHECKLIST_AVARIAS.filter((item) => detalhe.triagem_avarias?.[item.key]).length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Nenhuma avaria marcada</p>
              )}
              {CHECKLIST_AVARIAS.filter((item) => detalhe.triagem_avarias?.[item.key]).map((item) => (
                <Badge key={item.key} tono="copper">
                  {item.label}
                </Badge>
              ))}
            </div>
            {fotosDetalhe.length > 0 && (
              <div className="campo-form">
                <label>Fotos</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {fotosDetalhe.map(
                    (f) =>
                      f.url && (
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                          <img src={f.url} alt="" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 4 }} />
                        </a>
                      ),
                  )}
                </div>
              </div>
            )}
            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
