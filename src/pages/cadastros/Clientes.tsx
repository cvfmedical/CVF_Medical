import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { validarCnpj, formatarCnpj, somenteDigitos } from '../../lib/cnpj';
import { consultarCnpj } from '../../lib/consultaCnpj';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { useRascunhoDeTela } from '../../lib/useRascunhoDeTela';
import { IconPencil, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { ComboboxBusca } from '../../components/ComboboxBusca';
import { Badge } from '../../components/Badge';

interface Cliente {
  id: number;
  razao_social: string;
  cnpj: string | null;
  nome_fantasia: string | null;
  hospital_clinica: string | null;
  eh_terceirizado: boolean;
  representante_id: number | null;
  telefone: string | null;
  email: string | null;
  emails_adicionais: string | null;
  logradouro: string | null;
  numero_endereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  situacao_cadastral: string | null;
  natureza_juridica: string | null;
  cnae_principal: string | null;
  data_abertura: string | null;
  porte: string | null;
}

const formVazio = {
  razao_social: '',
  cnpj: '',
  nome_fantasia: '',
  hospital_clinica: '',
  eh_terceirizado: false,
  representante_id: '',
  telefone: '',
  email: '',
  emails_adicionais: '',
  logradouro: '',
  numero_endereco: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  situacao_cadastral: '',
  natureza_juridica: '',
  cnae_principal: '',
  data_abertura: '',
  porte: '',
};

export function Clientes() {
  const qc = useQueryClient();
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState(formVazio);
  const [filtro, setFiltro] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [consultando, setConsultando] = useState(false);

  const { minimizar: minimizarRascunho } = useRascunhoDeTela('clientes', {
    titulo: editando ? 'Editar cliente' : 'Novo cliente',
    obterEstado: () => ({ form, editando }),
    aoRestaurar: (e) => {
      setForm((e.form as typeof formVazio) ?? formVazio);
      setEditando((e.editando as Cliente | null) ?? null);
      setErro(null);
      setModalAberto(true);
    },
  });

  function minimizarCliente() {
    minimizarRascunho();
    setModalAberto(false);
  }

  const query = useQuery({
    queryKey: ['clientes'],
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase.from('clientes').select('*').order('razao_social');
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const linhas = (query.data ?? []).filter((c) => {
    if (!filtro.trim()) return true;
    const termo = filtro.trim().toLowerCase();
    return (
      c.razao_social.toLowerCase().includes(termo) ||
      (c.cnpj ?? '').includes(termo) ||
      (c.hospital_clinica ?? '').toLowerCase().includes(termo)
    );
  });

  function abrirNovo() {
    setEditando(null);
    setForm(formVazio);
    setErro(null);
    setModalAberto(true);
  }

  function abrirEdicao(c: Cliente) {
    setEditando(c);
    setForm({
      razao_social: c.razao_social,
      cnpj: c.cnpj ?? '',
      nome_fantasia: c.nome_fantasia ?? '',
      hospital_clinica: c.hospital_clinica ?? '',
      eh_terceirizado: c.eh_terceirizado,
      representante_id: c.representante_id ? String(c.representante_id) : '',
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      emails_adicionais: c.emails_adicionais ?? '',
      logradouro: c.logradouro ?? '',
      numero_endereco: c.numero_endereco ?? '',
      complemento: c.complemento ?? '',
      bairro: c.bairro ?? '',
      cidade: c.cidade ?? '',
      uf: c.uf ?? '',
      cep: c.cep ?? '',
      situacao_cadastral: c.situacao_cadastral ?? '',
      natureza_juridica: c.natureza_juridica ?? '',
      cnae_principal: c.cnae_principal ?? '',
      data_abertura: c.data_abertura ?? '',
      porte: c.porte ?? '',
    });
    setErro(null);
    setModalAberto(true);
  }

  async function excluir(c: Cliente) {
    if (!confirm(`Excluir o cliente ${c.razao_social}?`)) return;
    const { error } = await supabase.from('clientes').delete().eq('id', c.id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['clientes'] });
  }

  // manual=true quando o usuário clica em "Buscar" (mostra avisos de CNPJ
  // incompleto/inválido); no onBlur (manual=false) fica quieto se ainda não
  // há 14 dígitos válidos, pra não poluir com erro enquanto digita.
  async function buscarPorCnpj(manual = false) {
    if (somenteDigitos(form.cnpj).length !== 14) {
      if (manual) setErro('Digite o CNPJ completo (14 dígitos) para buscar.');
      return;
    }
    if (!validarCnpj(form.cnpj)) {
      if (manual) setErro('CNPJ inválido (dígitos verificadores não conferem).');
      return;
    }
    setConsultando(true);
    setErro(null);
    try {
      const r = await consultarCnpj(form.cnpj);
      if (!r.ok) {
        setErro(
          r.motivo === 'limite'
            ? 'Limite da consulta gratuita atingido. Aguarde alguns instantes e clique em "Buscar" de novo, ou preencha manualmente.'
            : r.motivo === 'nao_encontrado'
              ? 'CNPJ não encontrado na base pública. Preencha os dados manualmente.'
              : r.motivo === 'cnpj_invalido'
                ? 'CNPJ incompleto ou inválido.'
                : 'Não foi possível consultar agora (rede/serviço indisponível). Tente novamente ou preencha manualmente.',
        );
        return;
      }
      const dados = r.dados;
      setErro(null);
      setForm((f) => ({
        ...f,
        razao_social: dados.razao_social || f.razao_social,
        nome_fantasia: dados.nome_fantasia || f.nome_fantasia,
        telefone: dados.telefone || f.telefone,
        email: dados.email || f.email,
        logradouro: dados.logradouro || f.logradouro,
        numero_endereco: dados.numero_endereco || f.numero_endereco,
        complemento: dados.complemento || f.complemento,
        bairro: dados.bairro || f.bairro,
        cidade: dados.cidade || f.cidade,
        uf: dados.uf || f.uf,
        cep: dados.cep || f.cep,
        situacao_cadastral: dados.situacao_cadastral || f.situacao_cadastral,
        natureza_juridica: dados.natureza_juridica || f.natureza_juridica,
        cnae_principal: dados.cnae_principal || f.cnae_principal,
        data_abertura: dados.data_abertura || f.data_abertura,
        porte: dados.porte || f.porte,
      }));
    } finally {
      setConsultando(false);
    }
  }

  async function salvar() {
    setErro(null);
    if (!form.razao_social) {
      setErro('Informe a razão social.');
      return;
    }
    if (form.cnpj && !validarCnpj(form.cnpj)) {
      setErro('CNPJ inválido.');
      return;
    }
    if (!form.cnpj && !form.representante_id) {
      setErro('CNPJ é obrigatório (só é opcional para clientes que são unidade atendida de um terceirizado).');
      return;
    }
    setSalvando(true);
    try {
      const dados = {
        ...form,
        cnpj: form.cnpj ? formatarCnpj(form.cnpj) : null,
        data_abertura: form.data_abertura || null,
        representante_id: form.representante_id ? Number(form.representante_id) : null,
      };
      if (editando) {
        const { error } = await supabase.from('clientes').update(dados).eq('id', editando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clientes').insert(dados);
        if (error) throw error;
      }
      setModalAberto(false);
      qc.invalidateQueries({ queryKey: ['clientes'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (query.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Clientes / hospitais</h1>
        <button className="botao-primario botao-pequeno" onClick={abrirNovo}>
          <IconPlus size={16} /> Novo
        </button>
      </div>

      <input className="campo-filtro" placeholder="Buscar..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>Razão social</th>
            <th></th>
            <th>Nome fantasia</th>
            <th>CNPJ</th>
            <th>Cidade/UF</th>
            <th>Telefone</th>
            <th>E-mail</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => (
            <tr key={c.id}>
              <td>{c.razao_social}</td>
              <td>{c.eh_terceirizado && <Badge tono="copper">Terceirizado</Badge>}</td>
              <td>{c.nome_fantasia}</td>
              <td className="mono">{c.cnpj ?? '-'}</td>
              <td>{c.cidade ? `${c.cidade}/${c.uf}` : '-'}</td>
              <td>{c.telefone}</td>
              <td>{c.email}</td>
              <td className="acoes-tabela">
                <button className="botao-icone" title="Editar" onClick={() => abrirEdicao(c)}>
                  <IconPencil size={16} />
                </button>
                <button className="botao-icone perigo" title="Excluir" onClick={() => excluir(c)}>
                  <IconTrash size={16} />
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={8}>Nenhum registro encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <ModalJanela
          titulo={editando ? 'Editar cliente' : 'Novo cliente'}
          aoFechar={() => setModalAberto(false)}
          aoMinimizar={minimizarCliente}
          larguraMax={640}
        >
            <div className="campo-form">
              <label>CNPJ {form.representante_id ? '' : '*'}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={form.cnpj}
                  onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
                  onBlur={() => buscarPorCnpj(false)}
                  placeholder="Só números ou com máscara"
                />
                <button className="botao-secundario" onClick={() => buscarPorCnpj(true)} disabled={consultando}>
                  <IconSearch size={14} /> {consultando ? 'Consultando...' : 'Buscar'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Ao sair do campo, busca automaticamente os dados na Receita Federal (BrasilAPI).
              </p>
            </div>

            <div className="campo-form">
              <label>Razão social *</label>
              <input type="text" value={form.razao_social} onChange={(e) => setForm((f) => ({ ...f, razao_social: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>Nome fantasia</label>
              <input type="text" value={form.nome_fantasia} onChange={(e) => setForm((f) => ({ ...f, nome_fantasia: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>Hospital/clínica (unidade atendida)</label>
              <input type="text" value={form.hospital_clinica} onChange={(e) => setForm((f) => ({ ...f, hospital_clinica: e.target.value }))} />
            </div>

            <div className="campo-form" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="eh_terceirizado"
                checked={form.eh_terceirizado}
                onChange={(e) =>
                  setForm((f) => ({ ...f, eh_terceirizado: e.target.checked, representante_id: e.target.checked ? '' : f.representante_id }))
                }
                style={{ width: 'auto' }}
              />
              <label htmlFor="eh_terceirizado" style={{ marginBottom: 0 }}>
                Este cliente é um terceirizado/representante?
              </label>
            </div>
            <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: -8, marginBottom: 12 }}>
              Marque quando este cliente atende outros clientes em nome deles (ex: um distribuidor) - na Entrada de
              equipamento ele é selecionado como Cliente, e a NF/orçamento saem endereçados a ele.
            </p>

            {!form.eh_terceirizado && (
              <div className="campo-form">
                <label>Terceirizado responsável (se este cliente é atendido por um representante)</label>
                <ComboboxBusca
                  opcoes={(query.data ?? [])
                    .filter((c) => c.eh_terceirizado && c.id !== editando?.id)
                    .map((c) => ({ value: String(c.id), label: c.razao_social }))}
                  valor={form.representante_id}
                  onChange={(valor) => setForm((f) => ({ ...f, representante_id: valor }))}
                />
              </div>
            )}

            <div className="campo-form">
              <label>Telefone</label>
              <input type="text" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>E-mail</label>
              <input type="text" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>

            <div className="campo-form">
              <label>E-mails adicionais (cópia no envio do orçamento)</label>
              <input
                type="text"
                placeholder="separe por vírgula, ex: financeiro@cliente.com, compras@cliente.com"
                value={form.emails_adicionais}
                onChange={(e) => setForm((f) => ({ ...f, emails_adicionais: e.target.value }))}
              />
            </div>

            <h2 style={{ fontSize: 14, marginTop: 20 }}>Endereço</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="campo-form" style={{ flex: 2 }}>
                <label>Logradouro</label>
                <input type="text" value={form.logradouro} onChange={(e) => setForm((f) => ({ ...f, logradouro: e.target.value }))} />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Número</label>
                <input type="text" value={form.numero_endereco} onChange={(e) => setForm((f) => ({ ...f, numero_endereco: e.target.value }))} />
              </div>
            </div>
            <div className="campo-form">
              <label>Complemento</label>
              <input type="text" value={form.complemento} onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="campo-form" style={{ flex: 2 }}>
                <label>Bairro</label>
                <input type="text" value={form.bairro} onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))} />
              </div>
              <div className="campo-form" style={{ flex: 2 }}>
                <label>Cidade</label>
                <input type="text" value={form.cidade} onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))} />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>UF</label>
                <input type="text" maxLength={2} value={form.uf} onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.toUpperCase() }))} />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>CEP</label>
                <input type="text" value={form.cep} onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))} />
              </div>
            </div>

            <h2 style={{ fontSize: 14, marginTop: 20 }}>Dados da Receita Federal</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Situação cadastral</label>
                <input type="text" value={form.situacao_cadastral} onChange={(e) => setForm((f) => ({ ...f, situacao_cadastral: e.target.value }))} />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Porte</label>
                <input type="text" value={form.porte} onChange={(e) => setForm((f) => ({ ...f, porte: e.target.value }))} />
              </div>
              <div className="campo-form" style={{ flex: 1 }}>
                <label>Data de abertura</label>
                <input type="date" value={form.data_abertura} onChange={(e) => setForm((f) => ({ ...f, data_abertura: e.target.value }))} />
              </div>
            </div>
            <div className="campo-form">
              <label>Natureza jurídica</label>
              <input type="text" value={form.natureza_juridica} onChange={(e) => setForm((f) => ({ ...f, natureza_juridica: e.target.value }))} />
            </div>
            <div className="campo-form">
              <label>Atividade principal (CNAE)</label>
              <input type="text" value={form.cnae_principal} onChange={(e) => setForm((f) => ({ ...f, cnae_principal: e.target.value }))} />
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
        </ModalJanela>
      )}
    </div>
  );
}
