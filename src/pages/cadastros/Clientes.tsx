import { useState } from 'react';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { mensagemErro } from '../../lib/erros';
import { validarCnpj, formatarCnpj, somenteDigitos } from '../../lib/cnpj';
import { consultarCnpj } from '../../lib/consultaCnpj';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { useRascunhoDeTela } from '../../lib/useRascunhoDeTela';
import { normalizarTagContagem } from '../../lib/normalizarTagContagem';
import { IconPencil, IconPlus, IconSearch, IconTag, IconTrash } from '@tabler/icons-react';
import { ComboboxBusca } from '../../components/ComboboxBusca';
import { Badge } from '../../components/Badge';
import { imprimirEtiquetaDespacho } from '../../lib/etiquetaDespacho';

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
  // Tabela de preços padrão desse cliente (Valor 1/2/3) - preenche
  // sozinho o preço de itens que têm tabela cadastrada em Produtos e
  // serviços, na hora de montar o orçamento.
  tabela_preco_padrao: string | null;
  // Faturamento diferido de peças (ex.: Grupo Cortical) - a mão de obra é
  // faturada na hora (NF de serviço) e as peças usadas são cobradas à
  // parte, vencendo no 5º dia útil do mês seguinte.
  faturamento_pecas_diferido: boolean;
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
  tabela_preco_padrao: '',
  faturamento_pecas_diferido: false,
};

const COLUNAS_FILTRAVEIS = ['razao_social', 'eh_terceirizado', 'nome_fantasia', 'cnpj', 'cidade', 'telefone', 'email'];

export function Clientes() {
  const qc = useQueryClient();
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState(formVazio);
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [consultando, setConsultando] = useState(false);

  // Preço fixo por modalidade de manutenção (ex: Básica/Intermediária/
  // Completa) - cada cliente paga um valor diferente pra mesma
  // modalidade, então o preço fica aqui, não no cadastro da modalidade.
  const [clientePrecos, setClientePrecos] = useState<Cliente | null>(null);
  const [modalidadeId, setModalidadeId] = useState('');
  const [valorFixoNovo, setValorFixoNovo] = useState('');
  const [erroPrecos, setErroPrecos] = useState<string | null>(null);

  const modalidadesQuery = useQuery({
    queryKey: ['modalidades-manutencao-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('modalidades_manutencao')
        .select('id, nome')
        .eq('status_ativo', true)
        .order('nome');
      if (error) throw error;
      return data as { id: number; nome: string }[];
    },
  });

  const precosModalidadeQuery = useQuery({
    queryKey: ['cliente-modalidade-precos', clientePrecos?.id],
    enabled: !!clientePrecos,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente_modalidade_precos')
        .select('id, modalidade_id, valor_fixo')
        .eq('cliente_id', clientePrecos!.id);
      if (error) throw error;
      return data as { id: number; modalidade_id: number; valor_fixo: number }[];
    },
  });

  function nomeModalidade(id: number) {
    return modalidadesQuery.data?.find((m) => m.id === id)?.nome ?? `#${id}`;
  }

  function abrirPrecosModalidade(c: Cliente) {
    setClientePrecos(c);
    setModalidadeId('');
    setValorFixoNovo('');
    setErroPrecos(null);
  }

  async function adicionarPrecoModalidade() {
    if (!clientePrecos) return;
    setErroPrecos(null);
    if (!modalidadeId || !valorFixoNovo) {
      setErroPrecos('Selecione a modalidade e informe o valor.');
      return;
    }
    const { error } = await supabase.from('cliente_modalidade_precos').insert({
      cliente_id: clientePrecos.id,
      modalidade_id: Number(modalidadeId),
      valor_fixo: Number(valorFixoNovo),
    });
    if (error) {
      setErroPrecos(mensagemErro(error));
      return;
    }
    setModalidadeId('');
    setValorFixoNovo('');
    qc.invalidateQueries({ queryKey: ['cliente-modalidade-precos', clientePrecos.id] });
  }

  async function excluirPrecoModalidade(id: number) {
    const { error } = await supabase.from('cliente_modalidade_precos').delete().eq('id', id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['cliente-modalidade-precos', clientePrecos?.id] });
  }

  // Tabela de preço por quantidade de peças, aplicada AUTOMATICAMENTE na
  // precificação (OrcamentoFinanceiro.tsx) - o sistema conta quantos itens
  // do orçamento têm a tag "grupo_contado" (cadastrada em Produtos e
  // serviços, campo "Grupo de contagem") e acha a linha certa sozinho, sem
  // o financeiro escolher na mão. "Grupo extra" é opcional - quando
  // preenchido, a linha só bate se aquele outro grupo também estiver (ou
  // não estiver, conforme "presente/ausente") no orçamento. Exemplo real:
  // grupo_contado=ROD_LENS, grupo_extra=OBJETIVA, presente=true,
  // quantidade=3 → "OBJETIVA + 3 ROD_LENS".
  const [clientePrecosQtd, setClientePrecosQtd] = useState<Cliente | null>(null);
  const [descricaoQtdNova, setDescricaoQtdNova] = useState('');
  const [grupoContadoNovo, setGrupoContadoNovo] = useState('');
  const [quantidadeNova, setQuantidadeNova] = useState('');
  const [usaGrupoExtra, setUsaGrupoExtra] = useState(false);
  const [grupoExtraNovo, setGrupoExtraNovo] = useState('');
  const [extraPresenteNovo, setExtraPresenteNovo] = useState(true);
  const [valorQtdNovo, setValorQtdNovo] = useState('');
  const [erroPrecosQtd, setErroPrecosQtd] = useState<string | null>(null);

  interface PrecoQuantidadeCadastro {
    id: number;
    descricao: string;
    grupo_contado: string;
    quantidade: number;
    grupo_extra: string | null;
    extra_presente: boolean;
    valor_fixo: number;
  }

  const precosQuantidadeQuery = useQuery({
    queryKey: ['cliente-precos-quantidade', clientePrecosQtd?.id],
    enabled: !!clientePrecosQtd,
    queryFn: async (): Promise<PrecoQuantidadeCadastro[]> => {
      const { data, error } = await supabase
        .from('cliente_precos_quantidade')
        .select('id, descricao, grupo_contado, quantidade, grupo_extra, extra_presente, valor_fixo')
        .eq('cliente_id', clientePrecosQtd!.id)
        .order('grupo_extra')
        .order('quantidade');
      if (error) throw error;
      return data as PrecoQuantidadeCadastro[];
    },
  });

  function abrirPrecosQuantidade(c: Cliente) {
    setClientePrecosQtd(c);
    setDescricaoQtdNova('');
    setGrupoContadoNovo('');
    setQuantidadeNova('');
    setUsaGrupoExtra(false);
    setGrupoExtraNovo('');
    setExtraPresenteNovo(true);
    setValorQtdNovo('');
    setErroPrecosQtd(null);
  }

  async function adicionarPrecoQuantidade() {
    if (!clientePrecosQtd) return;
    setErroPrecosQtd(null);
    if (!descricaoQtdNova.trim() || !grupoContadoNovo.trim() || quantidadeNova === '' || !valorQtdNovo) {
      setErroPrecosQtd('Preencha descrição, grupo contado, quantidade e valor.');
      return;
    }
    if (usaGrupoExtra && !grupoExtraNovo.trim()) {
      setErroPrecosQtd('Informe o grupo extra, ou desmarque "Depende de outro item".');
      return;
    }
    const { error } = await supabase.from('cliente_precos_quantidade').insert({
      cliente_id: clientePrecosQtd.id,
      descricao: descricaoQtdNova.trim(),
      grupo_contado: normalizarTagContagem(grupoContadoNovo),
      quantidade: Number(quantidadeNova),
      grupo_extra: usaGrupoExtra ? normalizarTagContagem(grupoExtraNovo) : null,
      extra_presente: usaGrupoExtra ? extraPresenteNovo : true,
      valor_fixo: Number(valorQtdNovo),
    });
    if (error) {
      setErroPrecosQtd(mensagemErro(error));
      return;
    }
    setDescricaoQtdNova('');
    setQuantidadeNova('');
    setValorQtdNovo('');
    qc.invalidateQueries({ queryKey: ['cliente-precos-quantidade', clientePrecosQtd.id] });
  }

  async function excluirPrecoQuantidade(id: number) {
    const { error } = await supabase.from('cliente_precos_quantidade').delete().eq('id', id);
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ['cliente-precos-quantidade', clientePrecosQtd?.id] });
  }

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

  function valorColuna(c: Cliente, chave: string): unknown {
    if (chave === 'eh_terceirizado') return c.eh_terceirizado ? 'Terceirizado' : '';
    if (chave === 'cidade') return c.cidade ? `${c.cidade}/${c.uf ?? ''}` : '';
    return (c as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (query.data ?? []).filter((c) =>
    COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(c, chave), chave)),
  );
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

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
      tabela_preco_padrao: c.tabela_preco_padrao ?? '',
      faturamento_pecas_diferido: c.faturamento_pecas_diferido,
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
        tabela_preco_padrao: form.tabela_preco_padrao || null,
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
    <>
    <div>
      <div className="crud-cabecalho">
        <h1>Clientes / hospitais</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {algumFiltroAtivo && (
            <button className="botao-secundario botao-pequeno" onClick={limparTudo}>
              Limpar filtros
            </button>
          )}
          <button className="botao-primario botao-pequeno" onClick={abrirNovo}>
            <IconPlus size={16} /> Novo
          </button>
        </div>
      </div>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['razao_social', 'Razão social'],
              ['eh_terceirizado', 'Terceirizado'],
              ['nome_fantasia', 'Nome fantasia'],
              ['cnpj', 'CNPJ'],
              ['cidade', 'Cidade/UF'],
              ['telefone', 'Telefone'],
              ['email', 'E-mail'],
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
                new Set((query.data ?? []).map((c) => String(valorColuna(c, chave) ?? ''))),
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
                <button className="botao-secundario botao-pequeno" onClick={() => abrirPrecosModalidade(c)}>
                  Preços por modalidade
                </button>
                <button className="botao-secundario botao-pequeno" onClick={() => abrirPrecosQuantidade(c)}>
                  Preços por quantidade
                </button>
                <button
                  className="botao-icone"
                  title="Imprimir etiqueta de postagem (Correios)"
                  onClick={() =>
                    imprimirEtiquetaDespacho({
                      clienteNome: c.nome_fantasia || c.razao_social,
                      logradouro: c.logradouro,
                      numeroEndereco: c.numero_endereco,
                      complemento: c.complemento,
                      bairro: c.bairro,
                      cidade: c.cidade,
                      uf: c.uf,
                      cep: c.cep,
                    })
                  }
                >
                  <IconTag size={16} />
                </button>
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
              <label>Tabela de preço padrão (opcional)</label>
              <select
                value={form.tabela_preco_padrao}
                onChange={(e) => setForm((f) => ({ ...f, tabela_preco_padrao: e.target.value }))}
              >
                <option value="">Sem tabela específica (preço de venda padrão)</option>
                <option value="Valor 1">Valor 1</option>
                <option value="Valor 2">Valor 2</option>
                <option value="Valor 3">Valor 3</option>
              </select>
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Define qual coluna de preço (cadastro de Produtos e serviços) entra sozinha ao montar orçamento pra
                este cliente.
              </p>
            </div>

            <div className="campo-form" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="faturamento_pecas_diferido"
                checked={form.faturamento_pecas_diferido}
                onChange={(e) => setForm((f) => ({ ...f, faturamento_pecas_diferido: e.target.checked }))}
                style={{ width: 'auto' }}
              />
              <label htmlFor="faturamento_pecas_diferido" style={{ marginBottom: 0 }}>
                Peças com faturamento diferido (5º dia útil do mês seguinte)
              </label>
            </div>

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

    {clientePrecos && (
      <ModalJanela titulo={`Preços por modalidade - ${clientePrecos.razao_social}`} aoFechar={() => setClientePrecos(null)}>
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
          Preço fechado por modalidade de manutenção pra este cliente (diferente de precificar item por item). O
          financeiro seleciona a modalidade na hora de precificar um orçamento desse cliente.
        </p>

        <table className="tabela-crud">
          <thead>
            <tr>
              <th>Modalidade</th>
              <th>Valor fixo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(precosModalidadeQuery.data ?? []).map((p) => (
              <tr key={p.id}>
                <td>{nomeModalidade(p.modalidade_id)}</td>
                <td>R$ {Number(p.valor_fixo).toFixed(2)}</td>
                <td className="acoes-tabela">
                  <button className="botao-icone perigo" title="Remover" onClick={() => excluirPrecoModalidade(p.id)}>
                    <IconTrash size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {(precosModalidadeQuery.data ?? []).length === 0 && (
              <tr>
                <td colSpan={3}>Nenhum preço cadastrado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
          <div className="campo-form" style={{ flex: 1, marginBottom: 0 }}>
            <label>Modalidade</label>
            <select value={modalidadeId} onChange={(e) => setModalidadeId(e.target.value)}>
              <option value="">Selecione...</option>
              {(modalidadesQuery.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="campo-form" style={{ width: 140, marginBottom: 0 }}>
            <label>Valor fixo (R$)</label>
            <input type="number" value={valorFixoNovo} onChange={(e) => setValorFixoNovo(e.target.value)} />
          </div>
          <button className="botao-secundario" onClick={adicionarPrecoModalidade}>
            Adicionar
          </button>
        </div>

        {erroPrecos && <p className="erro-login">{erroPrecos}</p>}

        <div className="modal-acoes">
          <button className="botao-primario" onClick={() => setClientePrecos(null)}>
            Fechar
          </button>
        </div>
      </ModalJanela>
    )}

    {clientePrecosQtd && (
      <ModalJanela
        titulo={`Preços por quantidade - ${clientePrecosQtd.razao_social}`}
        aoFechar={() => setClientePrecosQtd(null)}
      >
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
          Preço fechado conforme a quantidade de peças trocadas (ex: "3 ROD LENS", "OBJETIVA + 2 ROD LENS") pra este
          cliente, aplicado automaticamente na precificação - o sistema conta quantos itens do orçamento têm cada
          "grupo de contagem" (cadastrado em Produtos e serviços) e acha a linha certa sozinho.
        </p>

        <table className="tabela-crud">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Regra</th>
              <th>Valor fixo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(precosQuantidadeQuery.data ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.descricao}</td>
                <td style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                  {p.grupo_extra ? `${p.extra_presente ? 'com' : 'sem'} ${p.grupo_extra} + ` : ''}
                  {p.quantidade}x {p.grupo_contado}
                </td>
                <td>R$ {Number(p.valor_fixo).toFixed(2)}</td>
                <td className="acoes-tabela">
                  <button className="botao-icone perigo" title="Remover" onClick={() => excluirPrecoQuantidade(p.id)}>
                    <IconTrash size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {(precosQuantidadeQuery.data ?? []).length === 0 && (
              <tr>
                <td colSpan={4}>Nenhum preço cadastrado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="campo-form" style={{ marginTop: 12 }}>
          <label>Descrição (rótulo pra exibição, ex: "3 ROD LENS")</label>
          <input type="text" value={descricaoQtdNova} onChange={(e) => setDescricaoQtdNova(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="campo-form" style={{ flex: 1 }}>
            <label>Grupo contado (ex: ROD_LENS)</label>
            <input
              type="text"
              value={grupoContadoNovo}
              onChange={(e) => setGrupoContadoNovo(e.target.value.toUpperCase())}
              placeholder="Tag cadastrada em Produtos e serviços"
            />
          </div>
          <div className="campo-form" style={{ width: 120 }}>
            <label>Quantidade</label>
            <input type="number" min={0} value={quantidadeNova} onChange={(e) => setQuantidadeNova(e.target.value)} />
          </div>
        </div>

        <div className="campo-form" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="usaGrupoExtra"
            checked={usaGrupoExtra}
            onChange={(e) => setUsaGrupoExtra(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <label htmlFor="usaGrupoExtra" style={{ marginBottom: 0 }}>
            Depende de outro item também estar (ou não estar) no orçamento?
          </label>
        </div>
        {usaGrupoExtra && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="campo-form" style={{ flex: 1 }}>
              <label>Grupo extra (ex: OBJETIVA)</label>
              <input type="text" value={grupoExtraNovo} onChange={(e) => setGrupoExtraNovo(e.target.value.toUpperCase())} />
            </div>
            <div className="campo-form" style={{ width: 160 }}>
              <label>Condição</label>
              <select
                value={extraPresenteNovo ? 'presente' : 'ausente'}
                onChange={(e) => setExtraPresenteNovo(e.target.value === 'presente')}
              >
                <option value="presente">Precisa estar presente</option>
                <option value="ausente">Precisa estar ausente</option>
              </select>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="campo-form" style={{ flex: 1, marginBottom: 0 }}>
            <label>Valor fixo (R$)</label>
            <input type="number" value={valorQtdNovo} onChange={(e) => setValorQtdNovo(e.target.value)} />
          </div>
          <button className="botao-secundario" onClick={adicionarPrecoQuantidade}>
            Adicionar
          </button>
        </div>

        {erroPrecosQtd && <p className="erro-login">{erroPrecosQtd}</p>}

        <div className="modal-acoes">
          <button className="botao-primario" onClick={() => setClientePrecosQtd(null)}>
            Fechar
          </button>
        </div>
      </ModalJanela>
    )}
    </>
  );
}
