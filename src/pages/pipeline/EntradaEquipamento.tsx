import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { enviarArquivoStorage, urlAssinadaFoto } from '../../lib/storage';
import { useAuth } from '../../contexts/AuthContext';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { IconPencil, IconPlus, IconPrinter, IconShare, IconTrash } from '@tabler/icons-react';
import { CHECKLIST_AVARIAS, type ChecklistAvarias } from '../../lib/checklistAvarias';
import { abrirImpressao } from '../../lib/imprimir';
import { linkEmail, linkWhatsApp, PORTAL_CLIENTE_URL } from '../../lib/compartilhar';

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
}

interface FotoEntrada {
  id: number;
  storage_path: string;
  descricao: string | null;
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
  condicao_chegada: '',
  nf_remessa_numero: '',
  nf_remessa_serie: '',
  nf_remessa_chave_acesso: '',
  nf_remessa_cfop: '',
  nf_remessa_data_emissao: '',
  nf_remessa_valor: '',
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

  const clientesQuery = useQuery({
    queryKey: ['clientes-opcoes-completo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, razao_social, telefone, email').order('razao_social');
      if (error) throw error;
      return data as Cliente[];
    },
  });

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
    setErro(null);
    setModalAberto(true);
  }

  function abrirEdicao(e: Entrada) {
    setEditando(e);
    setForm({
      cliente_id: String(e.cliente_id),
      equipamento_desc: e.equipamento_desc ?? '',
      equipamento_fab: e.equipamento_fab ?? '',
      equipamento_sn: e.equipamento_sn ?? '',
      defeito_relatado: e.defeito_relatado ?? '',
      condicao_chegada: e.condicao_chegada ?? '',
      nf_remessa_numero: e.nf_remessa_numero ?? '',
      nf_remessa_serie: e.nf_remessa_serie ?? '',
      nf_remessa_chave_acesso: e.nf_remessa_chave_acesso ?? '',
      nf_remessa_cfop: e.nf_remessa_cfop ?? '',
      nf_remessa_data_emissao: e.nf_remessa_data_emissao ?? '',
      nf_remessa_valor: e.nf_remessa_valor != null ? String(e.nf_remessa_valor) : '',
    });
    setAvarias(e.triagem_avarias ?? {});
    setFotos([]);
    setErro(null);
    setModalAberto(true);
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
        condicao_chegada: form.condicao_chegada || null,
        triagem_avarias: avarias,
        nf_remessa_numero: form.nf_remessa_numero || null,
        nf_remessa_serie: form.nf_remessa_serie || null,
        nf_remessa_chave_acesso: form.nf_remessa_chave_acesso || null,
        nf_remessa_cfop: form.nf_remessa_cfop || null,
        nf_remessa_data_emissao: form.nf_remessa_data_emissao || null,
        nf_remessa_valor: form.nf_remessa_valor ? Number(form.nf_remessa_valor) : null,
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

  async function converterEmOS(entrada: Entrada) {
    if (entrada.ordem_servico_id) {
      navigate(`/orcamento-tecnico?os=${entrada.ordem_servico_id}`);
      return;
    }
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
      navigate(`/orcamento-tecnico?os=${os.id}`);
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
    let fotosHtml = '';
    if (incluirFotos && fotosEntrada?.length) {
      const urls = await Promise.all((fotosEntrada as FotoEntrada[]).map((f) => urlAssinadaFoto(f.storage_path)));
      fotosHtml = `<div class="secao">Fotos</div><div class="fotos">${urls
        .filter(Boolean)
        .map((u) => `<img src="${u}" />`)
        .join('')}</div>`;
    }

    const avariasMarcadas = CHECKLIST_AVARIAS.filter((item) => entrada.triagem_avarias?.[item.key]).map(
      (item) => item.label,
    );

    abrirImpressao(
      `Entrada ${entrada.codigo_entrada}`,
      `
      <h1>Relatório de Entrada do Equipamento</h1>
      <p class="subtitulo">Q-CVF Medical - Manutenção em Equipamentos Cirúrgicos</p>
      <div class="linha"><div class="rotulo">Código</div><div class="valor mono">${entrada.codigo_entrada}</div></div>
      <div class="linha"><div class="rotulo">Cliente</div><div class="valor">${c?.razao_social ?? ''}</div></div>
      <div class="linha"><div class="rotulo">Equipamento</div><div class="valor">${entrada.equipamento_desc ?? '-'}</div></div>
      <div class="linha"><div class="rotulo">Fabricante</div><div class="valor">${entrada.equipamento_fab ?? '-'}</div></div>
      <div class="linha"><div class="rotulo">Nº de série</div><div class="valor">${entrada.equipamento_sn ?? '-'}</div></div>
      <div class="linha"><div class="rotulo">Defeito relatado</div><div class="valor">${entrada.defeito_relatado ?? '-'}</div></div>
      <div class="linha"><div class="rotulo">Condição de chegada</div><div class="valor">${entrada.condicao_chegada ?? '-'}</div></div>
      <div class="linha"><div class="rotulo">Data</div><div class="valor">${new Date(entrada.data_entrada).toLocaleString('pt-BR')}</div></div>
      <div class="secao">Nota fiscal de remessa para conserto</div>
      <div class="linha"><div class="rotulo">Número/Série</div><div class="valor mono">${entrada.nf_remessa_numero ?? '-'} / ${entrada.nf_remessa_serie ?? '-'}</div></div>
      <div class="linha"><div class="rotulo">CFOP</div><div class="valor">${entrada.nf_remessa_cfop ?? '-'}</div></div>
      <div class="linha"><div class="rotulo">Chave de acesso</div><div class="valor mono">${entrada.nf_remessa_chave_acesso ?? '-'}</div></div>
      <div class="linha"><div class="rotulo">Emissão / Valor</div><div class="valor">${entrada.nf_remessa_data_emissao ?? '-'} ${entrada.nf_remessa_valor ? '- R$ ' + Number(entrada.nf_remessa_valor).toFixed(2) : ''}</div></div>
      <div class="secao">Avarias identificadas na triagem</div>
      <div class="valor">${avariasMarcadas.length ? avariasMarcadas.join(', ') : 'Nenhuma avaria marcada'}</div>
      ${fotosHtml}
      `,
    );
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
              <td className="mono">{e.nf_remessa_numero || '-'}</td>
              <td>
                <Badge tono={e.ordem_servico_id ? 'teal' : 'copper'}>
                  {e.ordem_servico_id ? 'Convertida em OS' : e.status}
                </Badge>
              </td>
              <td>{new Date(e.data_entrada).toLocaleDateString('pt-BR')}</td>
              <td className="acoes-tabela">
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
                <button
                  className="botao-secundario"
                  style={{ marginLeft: 6 }}
                  disabled={convertendo === e.id}
                  onClick={() => converterEmOS(e)}
                >
                  {e.ordem_servico_id ? 'Ver OS' : convertendo === e.id ? 'Convertendo...' : 'Converter em OS'}
                </button>
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
              <label>Condição de chegada</label>
              <textarea
                value={form.condicao_chegada}
                onChange={(e) => setForm((f) => ({ ...f, condicao_chegada: e.target.value }))}
              />
            </div>

            <h2 style={{ fontSize: 14, marginTop: 20 }}>Nota fiscal de remessa para conserto</h2>
            <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: -8, marginBottom: 8 }}>
              Dados da NF-e emitida pelo cliente para o envio do equipamento (CFOP 5915/6915) - controle interno,
              não emite nota fiscal de verdade.
            </p>
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

            <div className="campo-form">
              <label>Fotos (pode escolher várias)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
              />
              {fotos.length > 0 && <p style={{ fontSize: 12 }}>{fotos.length} foto(s) selecionada(s)</p>}
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
