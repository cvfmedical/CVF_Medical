import { useState } from 'react';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { proximoNumeroDeJob, sufixoNumerico, numeroHerdadoOuNovo } from '../../lib/numeroSequencial';
import { enviarArquivoStorage, excluirArquivoStorage, urlAssinadaFoto } from '../../lib/storage';
import { useAuth } from '../../contexts/AuthContext';
import { mensagemErro } from '../../lib/erros';
import { Badge } from '../../components/Badge';
import { CarregandoTela } from '../../components/CarregandoTela';
import { IconClipboardList, IconMail, IconPencil, IconPlus, IconPrinter, IconQrcode, IconShare, IconTrash, IconX } from '@tabler/icons-react';
import { imprimirEtiquetaRastreio } from '../../lib/etiquetaRastreio';
import { abrirImpressao } from '../../lib/imprimir';
import { STATUS_OS_ORDENADOS } from '../../lib/statusOS';
import { type ChecklistAvarias } from '../../lib/checklistAvarias';
import { useAvariasTriagem } from '../../lib/useAvariasTriagem';
import { imprimirRegistroEntrada } from '../../lib/relatorioEntrada';
import { linkEmail, linkWhatsApp, PORTAL_CLIENTE_URL } from '../../lib/compartilhar';
import { CapturaFoto } from '../../components/CapturaFoto';
import { ModalJanela } from '../../components/ModalJanela';
import { useRascunhoDeTela } from '../../lib/useRascunhoDeTela';
import { ComboboxBusca } from '../../components/ComboboxBusca';
import { formatarModeloOtica } from '../../lib/formato';
import { registrarEmailEnviado } from '../../lib/emailsEnviados';
import { AlertaGarantia } from '../../components/AlertaGarantia';

const COLUNAS_FILTRAVEIS = ['codigo_entrada', 'cliente', 'equipamento_desc', 'equipamento_sn', 'nf_remessa', 'status', 'data_entrada'];

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
  eh_otica: boolean | null;
  catalogo_otica_id: number | null;
  cliente_final_id: number | null;
  grupo: string | null;
  subgrupo: string | null;
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
  grupo: string | null;
  subgrupo: string | null;
}

// Catálogo de produtos e serviços - usado aqui como catálogo de OUTROS tipos
// de equipamento (não-ótica: peças de mão de shaver, motores, cabos etc.),
// já que o Catálogo de óticas é específico para métricas ISO 8600.
interface ProdutoCatalogo {
  id: number;
  nome: string;
  marca_fabricante: string | null;
  tipo: string | null;
  categoria: string | null;
  subgrupo: string | null;
}

interface Cliente {
  id: number;
  razao_social: string;
  telefone: string | null;
  email: string | null;
  eh_terceirizado: boolean;
  representante_id: number | null;
  cnpj: string | null;
  nome_fantasia: string | null;
  logradouro: string | null;
  numero_endereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}

// Número compartilhado (mesmo sufixo numérico em Entrada/OS/Orçamento -
// só o prefixo muda) - só é mintado "do zero" aqui, na Entrada; ao
// converter em OS (converterEmOS abaixo), o número é herdado desta
// entrada, não gerado de novo.
async function gerarCodigoEntrada(): Promise<string> {
  const n = await proximoNumeroDeJob();
  return `ENT-${n}`;
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
  // Indica se o equipamento é uma ótica (dispara o checklist específico e o
  // fluxo simplificado de não-ótica mais adiante no pipeline). Preenchido
  // automaticamente ao escolher um dos catálogos, mas continua editável pra
  // cobrir entrada digitada na mão.
  const [ehOtica, setEhOtica] = useState<boolean | null>(null);
  const [catalogoOticaId, setCatalogoOticaId] = useState('');
  // Valor do combobox único "Selecionar tipo de equipamento" - combina
  // catálogo de óticas e produtos/serviços num só campo, no formato
  // "otica:<id>" ou "produto:<id>" (ver selecionarTipoEquipamento).
  const [tipoEquipamentoSelecionado, setTipoEquipamentoSelecionado] = useState('');
  // Grupo/Subgrupo do equipamento selecionado - fixo "ÓTICA"/"ÓTICA" quando
  // vem do catálogo de óticas, ou copiado do produto/serviço escolhido
  // quando não-ótica. Salvo na Entrada/OS pra filtrar peças/observações de
  // defeito no Orçamento Técnico.
  const [grupoEquipamento, setGrupoEquipamento] = useState('');
  const [subgrupoEquipamento, setSubgrupoEquipamento] = useState('');
  // Preenchido só quando o Cliente selecionado é um terceirizado - identifica
  // qual cliente final (unidade atendida) está sendo atendido nesta entrada.
  const [clienteFinalId, setClienteFinalId] = useState('');
  const [convertendo, setConvertendo] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<Entrada | null>(null);
  const [fotosDetalhe, setFotosDetalhe] = useState<{ id: number; url: string | null }[]>([]);
  const [condicaoParaAdicionar, setCondicaoParaAdicionar] = useState('');
  const [condicoesSelecionadas, setCondicoesSelecionadas] = useState<string[]>([]);
  const [fotosExistentes, setFotosExistentes] = useState<{ id: number; storage_path: string; url: string | null }[]>([]);
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();
  const [enviandoEmailId, setEnviandoEmailId] = useState<number | null>(null);
  // Envio em lote (igual ao Financeiro): manda o e-mail de chegada de
  // várias entradas do mesmo cliente num só e-mail, em vez de um por um.
  const [selecionadasEnvio, setSelecionadasEnvio] = useState<Set<number>>(new Set());
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);

  // Minimizar/restaurar preservando dados entre telas. Os File das fotos ficam
  // vivos porque o contexto de rascunhos mora na raiz do app.
  const { minimizar: minimizarRascunho } = useRascunhoDeTela('entrada-equipamento', {
    titulo: editando ? `Editar entrada ${editando.codigo_entrada}` : 'Nova entrada',
    obterEstado: () => ({
      form,
      avarias,
      fotos,
      fotosExistentes,
      condicoesSelecionadas,
      condicaoParaAdicionar,
      editando,
      ehOtica,
      catalogoOticaId,
      tipoEquipamentoSelecionado,
      grupoEquipamento,
      subgrupoEquipamento,
    }),
    aoRestaurar: (e) => {
      setForm((e.form as typeof formVazio) ?? formVazio);
      setAvarias((e.avarias as ChecklistAvarias) ?? {});
      setFotos((e.fotos as File[]) ?? []);
      setFotosExistentes(
        (e.fotosExistentes as { id: number; storage_path: string; url: string | null }[]) ?? [],
      );
      setCondicoesSelecionadas((e.condicoesSelecionadas as string[]) ?? []);
      setCondicaoParaAdicionar((e.condicaoParaAdicionar as string) ?? '');
      setEditando((e.editando as Entrada | null) ?? null);
      setEhOtica((e.ehOtica as boolean | null) ?? null);
      setCatalogoOticaId((e.catalogoOticaId as string) ?? '');
      setTipoEquipamentoSelecionado((e.tipoEquipamentoSelecionado as string) ?? '');
      setGrupoEquipamento((e.grupoEquipamento as string) ?? '');
      setSubgrupoEquipamento((e.subgrupoEquipamento as string) ?? '');
      setErro(null);
      setModalAberto(true);
    },
  });

  function minimizarEntrada() {
    minimizarRascunho();
    setModalAberto(false);
  }

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
      const { data, error } = await supabase
        .from('clientes')
        .select(
          'id, razao_social, telefone, email, eh_terceirizado, representante_id, cnpj, nome_fantasia, logradouro, numero_endereco, complemento, bairro, cidade, uf, cep',
        )
        .order('razao_social');
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const catalogoQuery = useQuery({
    queryKey: ['catalogo-oticas-opcoes'],
    queryFn: async (): Promise<CatalogoOtica[]> => {
      const { data, error } = await supabase
        .from('catalogo_oticas')
        .select('id, fabricante, modelo, tipo, diametro_mm, angulo_graus, grupo, subgrupo')
        .order('fabricante');
      if (error) throw error;
      return data as CatalogoOtica[];
    },
  });

  // Catálogo de produtos/serviços usado como fonte de OUTROS equipamentos
  // (não-ótica) - ex.: peça de mão de shaver, bomba de infusão. Só tipo
  // Produto/Serviço - "Peça" é peça de reposição, nunca um equipamento
  // recebido pra manutenção.
  const produtosCatalogoQuery = useQuery({
    queryKey: ['produtos-servicos-catalogo-entrada'],
    queryFn: async (): Promise<ProdutoCatalogo[]> => {
      const { data, error } = await supabase
        .from('produtos_servicos')
        .select('id, nome, marca_fabricante, tipo, categoria, subgrupo')
        .eq('status_ativo', true)
        .in('tipo', ['Produto', 'Serviço'])
        .order('nome');
      if (error) throw error;
      return data as ProdutoCatalogo[];
    },
  });

  // Combobox único "Selecionar tipo de equipamento" - junta o catálogo de
  // óticas (métricas ISO 8600) com os equipamentos não-ótica cadastrados em
  // Produtos e serviços. O valor combina os dois catálogos como
  // "otica:<id>" / "produto:<id>" pra distinguir de onde veio.
  const opcoesTipoEquipamento = [
    ...(catalogoQuery.data ?? []).map((c) => ({ value: `otica:${c.id}`, label: `Ótica — ${formatarModeloOtica(c)}` })),
    ...(produtosCatalogoQuery.data ?? []).map((p) => ({
      value: `produto:${p.id}`,
      label: `${p.tipo} — ${p.nome}${p.marca_fabricante ? ` (${p.marca_fabricante})` : ''}`,
    })),
  ];

  function selecionarTipoEquipamento(valor: string) {
    setTipoEquipamentoSelecionado(valor);
    const [tipo, id] = valor.split(':');
    if (tipo === 'otica') {
      const item = catalogoQuery.data?.find((c) => String(c.id) === id);
      if (!item) return;
      // Fabricante fica só no campo próprio (equipamento_fab) - não repete
      // dentro da descrição, pra não duplicar em telas que já mostram os
      // dois juntos ("descrição (fabricante)") ou em linhas separadas. O
      // subgrupo (ex: "ÓTICA", "MINI ÓTICA") entra na frente da descrição
      // pra ficar visível de cara qual categoria é, sem abrir o cadastro.
      setForm((f) => ({
        ...f,
        equipamento_fab: item.fabricante,
        equipamento_desc: item.subgrupo
          ? `${item.subgrupo} - ${formatarModeloOtica({ ...item, fabricante: '' })}`
          : formatarModeloOtica({ ...item, fabricante: '' }),
      }));
      setEhOtica(true);
      setCatalogoOticaId(id);
      setGrupoEquipamento(item.grupo ?? '');
      setSubgrupoEquipamento(item.subgrupo ?? '');
    } else if (tipo === 'produto') {
      const item = produtosCatalogoQuery.data?.find((p) => String(p.id) === id);
      if (!item) return;
      setForm((f) => ({
        ...f,
        equipamento_fab: item.marca_fabricante ?? '',
        equipamento_desc: item.subgrupo ? `${item.subgrupo} - ${item.nome}` : item.nome,
      }));
      setEhOtica(false);
      setCatalogoOticaId('');
      setGrupoEquipamento(item.categoria ?? '');
      setSubgrupoEquipamento(item.subgrupo ?? '');
    }
  }

  const avariasTriagemQuery = useAvariasTriagem();

  // Filtra o checklist de avarias pelo grupo/subgrupo do equipamento
  // selecionado acima, quando os itens tiverem essa marcação (cadastro
  // "Avarias de triagem"). Itens SEM grupo marcado são as avarias genéricas
  // de ótica (compartilhadas entre Ótica e Mini-Ótica, por isso não têm um
  // grupo específico) - só aparecem quando o equipamento selecionado for
  // ótica; pra equipamento não-ótico (peça de mão, pneumático etc.) ficam
  // escondidas, senão "LENTE DISTAL"/"OCULAR" apareceriam pra qualquer coisa.
  const checklistFiltrado = (avariasTriagemQuery.data ?? []).filter((item) => {
    if (!item.grupo) return ehOtica !== false;
    if (!grupoEquipamento) return true;
    if (item.grupo !== grupoEquipamento) return false;
    if (item.subgrupo && subgrupoEquipamento && item.subgrupo !== subgrupoEquipamento) return false;
    return true;
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

  function enderecoCompleto(c: Cliente): string | null {
    const partes = [[c.logradouro, c.numero_endereco].filter(Boolean).join(', '), c.complemento, c.bairro, c.cep ? `CEP ${c.cep}` : null];
    const texto = partes.filter(Boolean).join(' - ');
    return texto || null;
  }

  function valorColuna(e: Entrada, chave: string): unknown {
    if (chave === 'cliente') return cliente(e.cliente_id)?.razao_social ?? '';
    if (chave === 'nf_remessa') return e.nf_remessa_numero || e.numero_controle_cliente || '';
    if (chave === 'status') return e.ordem_servico_id ? 'Convertida em OS' : e.status;
    if (chave === 'data_entrada') return e.data_entrada;
    return (e as unknown as Record<string, unknown>)[chave];
  }

  // Sem filtro em nenhuma coluna, esconde as entradas já convertidas em OS -
  // a partir daí quem acompanha o andamento é a tela "Ordem de serviço", não
  // esta. Assim que alguma coluna é filtrada, passa a buscar em tudo
  // (inclusive já convertidas), pra continuar achável.
  const linhasFiltradas = (entradasQuery.data ?? []).filter((e) => {
    if (!algumFiltroAtivo) return !e.ordem_servico_id;
    return COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(e, chave), chave));
  });
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  // Cadastro rápido do cliente final (unidade atendida) direto da Entrada -
  // só o nome, sem passar pelo formulário completo de cliente (CNPJ é
  // opcional aqui: quem recebe a NF é o terceirizado, não a unidade).
  async function criarClienteFinal(nome: string) {
    const { data, error } = await supabase
      .from('clientes')
      .insert({ razao_social: nome, representante_id: Number(form.cliente_id) })
      .select('id')
      .single();
    if (error) {
      alert(mensagemErro(error));
      return;
    }
    await qc.invalidateQueries({ queryKey: ['clientes-opcoes-completo'] });
    setClienteFinalId(String(data.id));
  }

  function abrirNova() {
    setEditando(null);
    setForm(formVazio);
    setAvarias({});
    setFotos([]);
    setFotosExistentes([]);
    setCondicoesSelecionadas([]);
    setCondicaoParaAdicionar('');
    setEhOtica(null);
    setCatalogoOticaId('');
    setTipoEquipamentoSelecionado('');
    setGrupoEquipamento('');
    setSubgrupoEquipamento('');
    setClienteFinalId('');
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
    setEhOtica(e.eh_otica ?? null);
    setCatalogoOticaId(e.catalogo_otica_id ? String(e.catalogo_otica_id) : '');
    // Só dá pra reconstruir o valor do combobox quando veio do catálogo de
    // óticas (guarda o id); quando não-ótica, só o grupo/subgrupo ficaram
    // salvos - o combobox some em branco, mas o filtro do checklist abaixo
    // continua funcionando com o que já está salvo.
    setTipoEquipamentoSelecionado(e.catalogo_otica_id ? `otica:${e.catalogo_otica_id}` : '');
    setGrupoEquipamento(e.grupo ?? '');
    setSubgrupoEquipamento(e.subgrupo ?? '');
    setClienteFinalId(e.cliente_final_id ? String(e.cliente_final_id) : '');
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
        // 44 dígitos - remove espaços/pontos coladas como formatação de leitura.
        nf_remessa_chave_acesso: form.nf_remessa_chave_acesso ? form.nf_remessa_chave_acesso.replace(/\D/g, '') : null,
        nf_remessa_cfop: form.nf_remessa_cfop || null,
        nf_remessa_data_emissao: form.nf_remessa_data_emissao || null,
        nf_remessa_valor: form.nf_remessa_valor ? Number(form.nf_remessa_valor) : null,
        numero_controle_cliente: form.numero_controle_cliente || null,
        eh_otica: ehOtica,
        catalogo_otica_id: catalogoOticaId ? Number(catalogoOticaId) : null,
        cliente_final_id: clienteFinalId ? Number(clienteFinalId) : null,
        grupo: grupoEquipamento || null,
        subgrupo: subgrupoEquipamento || null,
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
      // Herda o mesmo número da entrada (só troca o prefixo) - Entrada e
      // OS do mesmo equipamento não devem ter números diferentes. Se esse
      // número já estiver em uso por um registro antigo/avulso (a
      // unificação não é retroativa), minta um número novo em vez de
      // colidir.
      const numeroOS = await numeroHerdadoOuNovo(
        'OS',
        'ordens_servico',
        'numero_os',
        `OS-${sufixoNumerico(entrada.codigo_entrada)}`,
      );
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
          eh_otica: entrada.eh_otica,
          catalogo_otica_id: entrada.catalogo_otica_id,
          cliente_final_id: entrada.cliente_final_id,
          grupo: entrada.grupo,
          subgrupo: entrada.subgrupo,
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

    imprimirRegistroEntrada(
      c
        ? {
            razao_social: c.razao_social,
            telefone: c.telefone,
            email: c.email,
            cnpj: c.cnpj,
            nome_fantasia: c.nome_fantasia,
            endereco: enderecoCompleto(c),
            cidade: c.cidade,
            uf: c.uf,
          }
        : undefined,
      entrada,
      urls,
      avariasTriagemQuery.data ?? [],
    );
  }

  // Mesmo documento impresso em "Ordem de serviço" (Ficha de
  // Acompanhamento), só que disponível já na triagem - antes de virar OS -
  // pra "caminhar" com o equipamento desde a chegada. Como ainda não tem
  // OS/orçamento nesse ponto, a seção de peças sempre mostra o texto
  // padrão de "ainda não aprovado".
  async function imprimirFicha(entrada: Entrada) {
    const c = cliente(entrada.cliente_id);
    const controleCliente = entrada.numero_controle_cliente
      ? entrada.numero_controle_cliente
      : entrada.nf_remessa_numero
        ? `NF ${entrada.nf_remessa_numero}${entrada.nf_remessa_serie ? '/' + entrada.nf_remessa_serie : ''}`
        : '-';

    const caixaCheck = '<span style="display:inline-block;width:8px;height:8px;border:1.2px solid #21201c;"></span>';

    const corpo = `
      <style>
        .etapas-bloco .laudo-secao { margin-top: 6px; padding: 2px 14px; font-size: 10px; }
        .etapas-compactas { margin-top: 1px; }
        .etapas-compactas th, .etapas-compactas td { padding: 1px 5px; font-size: 8px; line-height: 1.1; }
        table.etapas-compactas td:nth-child(3), table.etapas-compactas th:nth-child(3) { text-align: left; }
      </style>
      <h1>Ficha de Acompanhamento</h1>
      <p class="subtitulo">Documento interno - acompanha o equipamento dentro da CVF, marcado à mão a cada etapa.</p>

      <div class="laudo-secao">Identificação</div>
      <div class="laudo-caixa">
        <div class="laudo-linha-dupla">
          <div><strong>Nº Entrada:</strong> <span class="mono">${entrada.codigo_entrada}</span></div>
          <div><strong>Cliente:</strong> ${c?.razao_social ?? '-'}</div>
        </div>
        ${entrada.cliente_final_id ? `<div class="laudo-linha-dupla"><div><strong>Unidade atendida:</strong> ${cliente(entrada.cliente_final_id)?.razao_social ?? '-'}</div></div>` : ''}
        <div class="laudo-linha-dupla">
          <div><strong>Equipamento:</strong> ${entrada.equipamento_desc ?? '-'}${entrada.equipamento_fab ? ' (' + entrada.equipamento_fab + ')' : ''}</div>
          <div><strong>Nº de série:</strong> <span class="mono">${entrada.equipamento_sn ?? '-'}</span></div>
        </div>
        <div class="laudo-linha-dupla">
          <div style="border-right:0;">
            <strong>Nº controle interno / NF cliente:</strong> <span class="mono">${controleCliente}</span>
          </div>
        </div>
      </div>

      <div class="laudo-secao">Peças a substituir (conforme orçamento aprovado)</div>
      <div class="laudo-caixa"><p style="margin:0;color:var(--ink-400);">Orçamento ainda não aprovado.</p></div>

      <div class="etapas-bloco">
        <div class="laudo-secao">Etapas do processo</div>
        <table class="dados etapas-compactas">
          <thead>
            <tr>
              <th>Etapa</th>
              <th style="width:32px;text-align:center;">OK</th>
              <th style="width:220px;">Observação</th>
            </tr>
          </thead>
          <tbody>
            ${STATUS_OS_ORDENADOS.map(
              (etapa) => `<tr><td>${etapa}</td><td style="text-align:center;">${caixaCheck}</td><td></td></tr>`,
            ).join('')}
          </tbody>
        </table>
      </div>
    `;
    abrirImpressao(`Ficha de Acompanhamento - ${entrada.codigo_entrada}`, corpo, undefined, { semAssinaturas: true });
  }

  // E-mail automático (via Resend, servidor) avisando o cliente que o
  // equipamento chegou e já passou pela triagem - diferente do botão
  // "Enviar link ao cliente" (que só abre um mailto:/WhatsApp manual).
  async function enviarEmailChegada(entrada: Entrada) {
    const c = cliente(entrada.cliente_id);
    if (!c?.email) {
      alert('Este cliente não tem e-mail cadastrado.');
      return;
    }
    setEnviandoEmailId(entrada.id);
    try {
      const equipamento = [entrada.equipamento_desc, entrada.equipamento_fab].filter(Boolean).join(' - ');
      const html = `<p>Prezado(a) cliente,</p>
        <p>Informamos que o equipamento <strong>${equipamento || 'informado'}</strong>${entrada.equipamento_sn ? ` (Nº série ${entrada.equipamento_sn})` : ''}, referente à entrada <strong>${entrada.codigo_entrada}</strong>, foi recebido em nossa unidade e já passou pela triagem inicial.</p>
        <p>Nossa equipe técnica dará início à avaliação e, em breve, você receberá o orçamento de manutenção.</p>
        <p>Acompanhe o andamento a qualquer momento pelo Portal do Cliente:<br/>
        <a href="${PORTAL_CLIENTE_URL}">${PORTAL_CLIENTE_URL}</a></p>
        <p>Permanecemos à disposição para quaisquer esclarecimentos.</p>
        <p>Atenciosamente,<br/><strong>Q-CVF Medical</strong></p>`;

      const { data, error } = await supabase.functions.invoke('enviar-orcamento', {
        body: {
          to: c.email,
          subject: `Q-CVF Medical - Equipamento recebido (${entrada.codigo_entrada})`,
          html,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao enviar o e-mail.');
      await registrarEmailEnviado({
        resendId: data?.id,
        destinatarios: [c.email],
        assunto: `Q-CVF Medical - Equipamento recebido (${entrada.codigo_entrada})`,
        entradaId: entrada.id,
        enviadoPor: funcionario?.id ?? null,
      });
      alert(`E-mail enviado para ${c.email}.`);
    } catch (e) {
      alert(mensagemErro(e));
    } finally {
      setEnviandoEmailId(null);
    }
  }

  function alternarSelecaoEnvio(e: Entrada) {
    setSelecionadasEnvio((atual) => {
      const novo = new Set(atual);
      if (novo.has(e.id)) {
        novo.delete(e.id);
        return novo;
      }
      const primeiroId = [...novo][0];
      if (primeiroId != null) {
        const primeira = entradasQuery.data?.find((x) => x.id === primeiroId);
        if (primeira?.cliente_id !== e.cliente_id) {
          alert('Só é possível enviar em lote entradas do mesmo cliente - desmarque a seleção atual primeiro.');
          return atual;
        }
      }
      novo.add(e.id);
      return novo;
    });
  }

  function alternarSelecaoTodosVisiveis(visiveis: Entrada[]) {
    const todosJaSelecionados = visiveis.length > 0 && visiveis.every((e) => selecionadasEnvio.has(e.id));
    if (todosJaSelecionados) {
      setSelecionadasEnvio(new Set());
      return;
    }
    const clienteAlvo = visiveis[0]?.cliente_id;
    const mesmoCliente = visiveis.filter((e) => e.cliente_id === clienteAlvo);
    if (mesmoCliente.length < visiveis.length) {
      alert('Só é possível enviar em lote entradas do mesmo cliente - filtre pela coluna "Cliente" antes de selecionar todas.');
    }
    setSelecionadasEnvio(new Set(mesmoCliente.map((e) => e.id)));
  }

  // Igual ao envio em lote do Financeiro: um único e-mail listando todas as
  // entradas selecionadas (do mesmo cliente), em vez de um e-mail por entrada.
  async function enviarSelecionadasPorEmail() {
    const lista = (entradasQuery.data ?? []).filter((e) => selecionadasEnvio.has(e.id));
    if (lista.length === 0) return;
    const c = cliente(lista[0].cliente_id);
    if (!c?.email) {
      setErroLote('Este cliente não tem e-mail cadastrado.');
      return;
    }
    setErroLote(null);
    setEnviandoLote(true);
    try {
      const itensHtml = lista
        .map((e) => {
          const equipamento = [e.equipamento_desc, e.equipamento_fab].filter(Boolean).join(' - ');
          return `<li><strong>${e.codigo_entrada}</strong> — ${equipamento || 'equipamento informado'}${e.equipamento_sn ? ` (Nº série ${e.equipamento_sn})` : ''}</li>`;
        })
        .join('');
      const html = `<p>Prezado(a) cliente,</p>
        <p>Informamos que os equipamentos abaixo foram recebidos em nossa unidade e já passaram pela triagem inicial:</p>
        <ul>${itensHtml}</ul>
        <p>Nossa equipe técnica dará início à avaliação e, em breve, você receberá o(s) orçamento(s) de manutenção.</p>
        <p>Acompanhe o andamento a qualquer momento pelo Portal do Cliente:<br/>
        <a href="${PORTAL_CLIENTE_URL}">${PORTAL_CLIENTE_URL}</a></p>
        <p>Permanecemos à disposição para quaisquer esclarecimentos.</p>
        <p>Atenciosamente,<br/><strong>Q-CVF Medical</strong></p>`;

      const assunto = `Q-CVF Medical - Equipamentos recebidos (${lista.map((e) => e.codigo_entrada).join(', ')})`;
      const { data, error } = await supabase.functions.invoke('enviar-orcamento', {
        body: { to: c.email, subject: assunto, html },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Falha ao enviar o e-mail.');

      await registrarEmailEnviado({
        resendId: data?.id,
        destinatarios: [c.email],
        assunto,
        entradaIds: lista.map((e) => e.id),
        enviadoPor: funcionario?.id ?? null,
      });

      alert(`E-mail enviado para ${c.email} com ${lista.length} entrada(s).`);
      setSelecionadasEnvio(new Set());
    } catch (e) {
      setErroLote(mensagemErro(e));
    } finally {
      setEnviandoLote(false);
    }
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
        <h1>Recebimento / triagem</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {algumFiltroAtivo && (
            <button className="botao-secundario botao-pequeno" onClick={limparTudo}>
              Limpar filtros
            </button>
          )}
          <button className="botao-primario botao-pequeno" onClick={abrirNova}>
            <IconPlus size={16} /> Nova entrada
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: -8, marginBottom: 8 }}>
        Mostrando só o que ainda não foi convertido em OS. Entradas já convertidas saem desta lista - use os filtros
        das colunas abaixo pra encontrá-las (ou acompanhe pela tela "Ordem de serviço"). Marque a caixa nas linhas
        para enviar o e-mail de chegada de várias entradas do mesmo cliente num só e-mail.
      </p>

      {selecionadasEnvio.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--paper-50)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 13 }}>{selecionadasEnvio.size} entrada(s) selecionada(s)</span>
          <button className="botao-primario botao-pequeno" onClick={enviarSelecionadasPorEmail} disabled={enviandoLote}>
            {enviandoLote ? 'Enviando...' : `Enviar por e-mail (${selecionadasEnvio.size})`}
          </button>
          <button className="botao-secundario botao-pequeno" onClick={() => setSelecionadasEnvio(new Set())} disabled={enviandoLote}>
            Limpar seleção
          </button>
          {erroLote && <span className="erro-login">{erroLote}</span>}
        </div>
      )}

      <table className="tabela-crud">
        <thead>
          <tr>
            <th>
              {(() => {
                if (linhas.length === 0) return null;
                const todosSelecionados = linhas.every((e) => selecionadasEnvio.has(e.id));
                return (
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={() => alternarSelecaoTodosVisiveis(linhas)}
                    title="Selecionar todas as linhas visíveis (mesmo cliente)"
                  />
                );
              })()}
            </th>
            {[
              ['codigo_entrada', 'Código'],
              ['cliente', 'Cliente'],
              ['equipamento_desc', 'Equipamento'],
              ['equipamento_sn', 'Nº de série'],
              ['nf_remessa', 'NF remessa'],
              ['status', 'Status'],
              ['data_entrada', 'Data'],
            ].map(([chave, label]) => (
              <ThOrdenavel key={chave} chave={chave} colunaAtiva={coluna} direcao={direcao} onClick={ordenarPor}>
                {label}
              </ThOrdenavel>
            ))}
            <th></th>
          </tr>
          <tr>
            <th></th>
            {COLUNAS_FILTRAVEIS.map((chave) => {
              const valoresDisponiveis = Array.from(
                new Set((entradasQuery.data ?? []).map((e) => String(valorColuna(e, chave) ?? ''))),
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
          {linhas.map((e) => (
            <tr key={e.id}>
              <td>
                <input type="checkbox" checked={selecionadasEnvio.has(e.id)} onChange={() => alternarSelecaoEnvio(e)} />
              </td>
              <td>
                <span className="link-numero mono" title="Ver entrada" onClick={() => abrirDetalhe(e)}>
                  {e.codigo_entrada}
                </span>
              </td>
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
                {/* "Converter em OS" primeiro no DOM (mesmo cabendo à
                    esquerda dos ícones) - é a ação principal dessa tela, e
                    numa tabela larga que precisa rolar pro lado, o que vem
                    primeiro fica visível sem precisar rolar. */}
                {!e.ordem_servico_id && (
                  <button
                    className="botao-secundario"
                    style={{ marginRight: 6 }}
                    disabled={convertendo === e.id}
                    onClick={() => converterEmOS(e)}
                  >
                    {convertendo === e.id ? 'Convertendo...' : 'Converter em OS'}
                  </button>
                )}
                <button className="botao-icone" title="Editar" onClick={() => abrirEdicao(e)}>
                  <IconPencil size={16} />
                </button>
                <button className="botao-icone" title="Imprimir relatório" onClick={() => imprimirRelatorio(e)}>
                  <IconPrinter size={16} />
                </button>
                <button
                  className="botao-icone"
                  title="Imprimir ficha de acompanhamento"
                  onClick={() => imprimirFicha(e)}
                >
                  <IconClipboardList size={16} />
                </button>
                <button
                  className="botao-icone"
                  title="Imprimir etiqueta de rastreio (QR Code)"
                  onClick={() =>
                    imprimirEtiquetaRastreio({
                      codigoEntrada: e.codigo_entrada,
                      clienteNome: cliente(e.cliente_id)?.razao_social ?? '-',
                      equipamento: e.equipamento_desc,
                    })
                  }
                >
                  <IconQrcode size={16} />
                </button>
                <button className="botao-icone" title="Enviar link ao cliente" onClick={() => compartilharLink(e)}>
                  <IconShare size={16} />
                </button>
                <button
                  className="botao-icone"
                  title="Enviar e-mail automático (equipamento recebido / triagem concluída)"
                  disabled={enviandoEmailId === e.id}
                  onClick={() => enviarEmailChegada(e)}
                >
                  <IconMail size={16} />
                </button>
                <button
                  className="botao-icone perigo"
                  title={e.ordem_servico_id ? 'Já convertida em OS - não pode mais ser excluída' : 'Excluir'}
                  onClick={() => excluir(e)}
                  disabled={!!e.ordem_servico_id}
                >
                  <IconTrash size={16} />
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={9}>Nenhum registro encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <ModalJanela
          titulo={editando ? `Editar entrada ${editando.codigo_entrada}` : 'Nova entrada'}
          aoFechar={() => setModalAberto(false)}
          aoMinimizar={minimizarEntrada}
          larguraMax={560}
        >
            <AlertaGarantia
              clienteId={form.cliente_id ? Number(form.cliente_id) : null}
              numeroSerie={form.equipamento_sn}
              ordemServicoIdAtual={editando?.ordem_servico_id ?? null}
            />
            {!!editando?.ordem_servico_id && (
              <p style={{ fontSize: 12, color: 'var(--copper-500)', marginTop: -8, marginBottom: 12 }}>
                Esta entrada já foi convertida em OS - os dados ficam somente-leitura (o checklist de avarias
                continua editável, na tela Registro de Entrada).
              </p>
            )}
            <div className="campo-form">
              <label>Cliente *</label>
              <ComboboxBusca
                opcoes={(clientesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.razao_social }))}
                valor={String(form.cliente_id ?? '')}
                onChange={(valor) => {
                  setForm((f) => ({ ...f, cliente_id: valor }));
                  setClienteFinalId('');
                }}
              />
            </div>
            {cliente(Number(form.cliente_id))?.eh_terceirizado && (
              <div className="campo-form">
                <label>Unidade atendida (cliente final)</label>
                <ComboboxBusca
                  opcoes={(clientesQuery.data ?? [])
                    .filter((c) => c.representante_id === Number(form.cliente_id))
                    .map((c) => ({ value: String(c.id), label: c.razao_social }))}
                  valor={clienteFinalId}
                  onChange={setClienteFinalId}
                  aoCriarNovo={criarClienteFinal}
                  textoCriarNovo="Cadastrar unidade"
                />
                <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                  Cliente é um terceirizado - identifique qual unidade está sendo atendida (informativo; orçamento e
                  NF continuam endereçados ao cliente selecionado acima).
                </p>
              </div>
            )}
            <div className="campo-form">
              <label>Selecionar tipo de equipamento *</label>
              <ComboboxBusca
                opcoes={opcoesTipoEquipamento}
                valor={tipoEquipamentoSelecionado}
                onChange={selecionarTipoEquipamento}
              />
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Junta o catálogo de óticas e os equipamentos cadastrados em "Produtos e serviços" - preenche
                descrição, fabricante e o grupo do equipamento sozinho (usado depois pra filtrar as peças
                disponíveis no orçamento). Só o número de série continua manual.
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
                <div style={{ flex: 1 }}>
                  <ComboboxBusca
                    opcoes={(condicoesChegadaQuery.data ?? [])
                      .filter((c) => !condicoesSelecionadas.includes(c.descricao))
                      .map((c) => ({ value: c.descricao, label: c.descricao }))}
                    valor={condicaoParaAdicionar}
                    onChange={setCondicaoParaAdicionar}
                  />
                </div>
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
              {checklistFiltrado.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(avarias[String(item.id)])}
                    onChange={(e) => setAvarias((a) => ({ ...a, [String(item.id)]: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13 }}>{item.descricao}</span>
                </div>
              ))}
              {checklistFiltrado.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>Nenhuma avaria cadastrada para este grupo/subgrupo ainda.</p>
              )}
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
              <button className="botao-primario" onClick={salvar} disabled={salvando || !!editando?.ordem_servico_id}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
        </ModalJanela>
      )}

      {detalhe && (
        <ModalJanela titulo={detalhe.codigo_entrada} aoFechar={() => setDetalhe(null)}>
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
        </ModalJanela>
      )}
    </div>
  );
}
