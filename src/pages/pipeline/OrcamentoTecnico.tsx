import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { sufixoNumerico, numeroHerdadoOuNovo } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { enviarArquivoStorage, urlAssinadaFoto } from '../../lib/storage';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { IconPencil, IconPhoto, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { STATUS_AGUARDANDO_ORCAMENTO } from '../../lib/statusOS';
import { useOSAguardandoOrcamento } from '../../lib/useOSAguardandoOrcamento';
import { imprimirRelatorioOS, type ItemRelatorioOS } from '../../lib/relatorioOrdemServico';
import { useConfirmarSenha } from '../../lib/useConfirmarSenha';
import { ComboboxBusca } from '../../components/ComboboxBusca';
import { CapturaFoto } from '../../components/CapturaFoto';
import { AlertaGarantia } from '../../components/AlertaGarantia';

interface Orcamento {
  id: number;
  numero_orcamento: string;
  status: string;
  observacoes_tecnico: string | null;
}

interface OSDetalhe {
  numero_os: string;
  cliente_id: number;
  cliente_nome: string;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
  defeito_relatado: string | null;
  prazo_entrega: string | null;
  eh_otica: boolean | null;
  grupo: string | null;
  subgrupo: string | null;
}

interface Cliente {
  razao_social: string;
  telefone: string | null;
  email: string | null;
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

interface ItemOrcamento {
  id: number;
  produto_servico_id: number | null;
  quantidade: number;
  observacao: string | null;
  descricao_servico: string | null;
  foto_peca_danificada_path: string | null;
}

interface OSOpcao {
  value: string;
  label: string;
}

export function OrcamentoTecnico() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [osId, setOsId] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoItemId, setEditandoItemId] = useState<number | null>(null);
  const [novoItem, setNovoItem] = useState({ produto_servico_id: '', quantidade: '1', descricao_servico: '' });
  const [observacaoParaAdicionar, setObservacaoParaAdicionar] = useState('');
  const [observacoesSelecionadas, setObservacoesSelecionadas] = useState<string[]>([]);
  const [justificativaLivre, setJustificativaLivre] = useState('');
  const [fotoItem, setFotoItem] = useState<File | null>(null);
  // Observações técnicas gerais (não por item) - essencial quando o serviço
  // não envolve troca de peça (ex.: "PEÇA DE MÃO DE SHAVER" travada, resolvido
  // só com limpeza/ajuste, sem adicionar item nenhum).
  const [observacoesGerais, setObservacoesGerais] = useState('');
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const { pedirConfirmacao, ModalConfirmacao } = useConfirmarSenha();

  // Mostra tanto OS ainda em triagem (orçamento novo) quanto OS que já
  // têm um orçamento em montagem (status "Aguardando Orçamento") - antes
  // só a primeira aparecia aqui, forçando o técnico a ir em "Ver
  // orçamento" em Ordens de Serviço pra continuar um orçamento já
  // iniciado, o que não era óbvio. Query compartilhada com o alerta
  // flutuante (AlertaOSAguardandoOrcamento).
  const osAguardandoQuery = useOSAguardandoOrcamento();
  const opcoesOSQuery = {
    ...osAguardandoQuery,
    data: osAguardandoQuery.data?.map((os): OSOpcao => ({
      value: String(os.id),
      label:
        os.status_os === STATUS_AGUARDANDO_ORCAMENTO
          ? `${os.numero_os} - ${os.cliente_nome} (orçamento em andamento)`
          : `${os.numero_os} - ${os.cliente_nome}`,
    })),
  };

  // Pré-seleciona a OS quando vem de "Converter em OS" (Entrada do
  // Equipamento) ou de "Ver orçamento" (Ordens de Serviço) - nesses
  // casos a OS pode já ter passado da triagem, por isso não depende da
  // lista filtrada acima.
  // Qual orçamento desta OS está sendo editado agora. Uma OS pode ter mais
  // de um (orçamentos alternativos - ex.: cliente escolhe entre só o
  // reparo pedido ou o reparo + uma peça extra que o técnico identificou);
  // null = segue o comportamento padrão de sempre mostrar o mais recente.
  const [orcamentoIdSelecionado, setOrcamentoIdSelecionado] = useState<number | null>(null);

  // ?orcamento= no link permite abrir direto num alternativo específico
  // (ex.: clicando no número dele em outra tela) - sem isso, a tela sempre
  // cairia no mais recente da OS, que pode não ser o que foi clicado.
  useEffect(() => {
    const osParam = searchParams.get('os');
    if (osParam) setOsId(osParam);
    const orcamentoParam = searchParams.get('orcamento');
    setOrcamentoIdSelecionado(orcamentoParam ? Number(orcamentoParam) : null);
  }, [searchParams]);

  const orcamentosOSQuery = useQuery({
    queryKey: ['orcamentos-da-os', osId],
    enabled: !!osId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('id, numero_orcamento, status')
        .eq('ordem_servico_id', Number(osId))
        .order('id', { ascending: true });
      if (error) throw error;
      return data as { id: number; numero_orcamento: string; status: string }[];
    },
  });
  const idOrcamentoAtivo = orcamentoIdSelecionado ?? orcamentosOSQuery.data?.at(-1)?.id ?? null;

  const orcamentoQuery = useQuery({
    queryKey: ['orcamento-detalhe', idOrcamentoAtivo],
    enabled: !!idOrcamentoAtivo,
    queryFn: async (): Promise<Orcamento | null> => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('id, numero_orcamento, status, observacoes_tecnico')
        .eq('id', idOrcamentoAtivo!)
        .maybeSingle();
      if (error) throw error;
      return data as Orcamento | null;
    },
  });

  // Cria mais um orçamento pra mesma OS (mesmo equipamento, escopo de
  // manutenção diferente) - ex.: Opção 1 só com o que o cliente pediu,
  // Opção 2 incluindo uma peça extra identificada no teste. Numeração
  // deriva do primeiro orçamento da OS (raiz sem sufixo) + /2, /3...
  // Quando um deles é aprovado, os outros da mesma OS são recusados
  // automaticamente (trigger sync_status_os_por_orcamento no banco).
  const [criandoAlternativo, setCriandoAlternativo] = useState(false);
  async function criarOrcamentoAlternativo() {
    const irmaos = orcamentosOSQuery.data ?? [];
    if (irmaos.length === 0) return;
    setErro(null);
    setCriandoAlternativo(true);
    try {
      const raiz = irmaos[0].numero_orcamento.split('/')[0];
      const proximoIndice = irmaos.length + 1;
      const { data, error } = await supabase
        .from('orcamentos')
        .insert({
          numero_orcamento: `${raiz}/${proximoIndice}`,
          ordem_servico_id: Number(osId),
          status: 'Aguardando Precificação',
        })
        .select('id')
        .single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['orcamentos-da-os', osId] });
      setOrcamentoIdSelecionado(data.id);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCriandoAlternativo(false);
    }
  }

  const osDetalheQuery = useQuery({
    queryKey: ['os-detalhe-orcamento-tecnico', osId],
    enabled: !!osId,
    queryFn: async (): Promise<OSDetalhe> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('numero_os, cliente_id, cliente_nome, optica_desc, optica_fab, optica_sn, defeito_relatado, prazo_entrega, eh_otica, grupo, subgrupo')
        .eq('id', Number(osId))
        .single();
      if (error) throw error;
      return data as OSDetalhe;
    },
  });

  const clienteQuery = useQuery({
    queryKey: ['cliente-orcamento-tecnico', osDetalheQuery.data?.cliente_id],
    enabled: !!osDetalheQuery.data?.cliente_id,
    queryFn: async (): Promise<Cliente> => {
      const { data, error } = await supabase
        .from('clientes')
        .select('razao_social, telefone, email, cnpj, nome_fantasia, logradouro, numero_endereco, complemento, bairro, cidade, uf, cep')
        .eq('id', osDetalheQuery.data!.cliente_id)
        .single();
      if (error) throw error;
      return data as Cliente;
    },
  });

  const produtosQuery = useQuery({
    queryKey: ['produtos-servicos-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos_servicos')
        .select('id, nome, tipo, categoria, subgrupo')
        .eq('status_ativo', true)
        .order('nome');
      if (error) throw error;
      return data as { id: number; nome: string; tipo: string | null; categoria: string | null; subgrupo: string | null }[];
    },
  });

  // "Produto" é o equipamento em si (não vendemos equipamento no orçamento,
  // só incluímos peças/serviços pra informar o que foi trocado/feito) - só
  // Peça/Serviço aparecem aqui. Filtra também pelo Grupo/Subgrupo salvo na
  // OS - agora vindo da MESMA taxonomia usada nas peças (Cadastro de itens)
  // e no Catálogo de óticas (cada modelo pode ser marcado com Grupo/
  // Subgrupo lá). Sem marcação de nenhum dos lados, mostra tudo (estado
  // seguro enquanto a classificação ainda não foi feita).
  const produtosFiltrados = (produtosQuery.data ?? []).filter((p) => {
    if (p.tipo === 'Produto') return false;
    const os = osDetalheQuery.data;
    if (!os?.grupo || !p.categoria) return true;
    if (p.categoria !== os.grupo) return false;
    if (p.subgrupo && os.subgrupo && p.subgrupo !== os.subgrupo) return false;
    return true;
  });

  const observacoesQuery = useQuery({
    queryKey: ['observacoes-defeito-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('observacoes_defeito')
        .select('id, descricao, grupo, subgrupo')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { id: number; descricao: string; grupo: string | null; subgrupo: string | null }[];
    },
  });

  // Filtra a lista de observações de defeito pelo grupo/subgrupo do produto
  // selecionado no item - observações sem grupo marcado continuam aparecendo
  // sempre (compatibilidade com o que já estava cadastrado sem essa marcação).
  const produtoDoItem = produtosQuery.data?.find((p) => String(p.id) === novoItem.produto_servico_id);
  const observacoesFiltradas = (observacoesQuery.data ?? []).filter((o) => {
    if (!produtoDoItem?.categoria) return true;
    if (o.grupo && o.grupo !== produtoDoItem.categoria) return false;
    if (produtoDoItem.subgrupo && o.subgrupo && o.subgrupo !== produtoDoItem.subgrupo) return false;
    return true;
  });

  const itensQuery = useQuery({
    queryKey: ['itens-orcamento', orcamentoQuery.data?.id],
    enabled: !!orcamentoQuery.data?.id,
    queryFn: async (): Promise<ItemOrcamento[]> => {
      const { data, error } = await supabase
        .from('orcamento_itens')
        .select('id, produto_servico_id, quantidade, observacao, descricao_servico, foto_peca_danificada_path')
        .eq('orcamento_id', orcamentoQuery.data!.id);
      if (error) throw error;
      return data as ItemOrcamento[];
    },
  });

  useEffect(() => {
    setObservacoesGerais(orcamentoQuery.data?.observacoes_tecnico ?? '');
  }, [orcamentoQuery.data?.id, orcamentoQuery.data?.observacoes_tecnico]);

  async function salvarObservacoesGerais() {
    if (!orcamentoQuery.data) return;
    setSalvandoObs(true);
    setErro(null);
    try {
      const { error } = await supabase
        .from('orcamentos')
        .update({ observacoes_tecnico: observacoesGerais.trim() || null })
        .eq('id', orcamentoQuery.data.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['orcamento-detalhe', orcamentoQuery.data.id] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvandoObs(false);
    }
  }

  async function criarOrcamento() {
    if (!osDetalheQuery.data) return;
    setErro(null);
    setCriando(true);
    try {
      // Herda o mesmo número da OS (só troca o prefixo) - o primeiro
      // orçamento de uma OS não deve ter um número diferente dela. Se esse
      // número já estiver em uso por um registro antigo/avulso (a
      // unificação não é retroativa), minta um número novo em vez de
      // colidir.
      const numero = await numeroHerdadoOuNovo(
        'ORC',
        'orcamentos',
        'numero_orcamento',
        `ORC-${sufixoNumerico(osDetalheQuery.data.numero_os)}`,
      );
      const { error } = await supabase.from('orcamentos').insert({
        numero_orcamento: numero,
        ordem_servico_id: Number(osId),
        status: 'Aguardando Precificação',
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['orcamentos-da-os', osId] });
      qc.invalidateQueries({ queryKey: ['ordens-servico-para-orcamento-tecnico'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCriando(false);
    }
  }

  function abrirModalItem() {
    setEditandoItemId(null);
    setNovoItem({ produto_servico_id: '', quantidade: '1', descricao_servico: '' });
    setObservacoesSelecionadas([]);
    setObservacaoParaAdicionar('');
    setJustificativaLivre('');
    setFotoItem(null);
    setErro(null);
    setModalAberto(true);
  }

  // Reaproveita o mesmo modal de "Adicionar item" pra editar um item já
  // existente - a observação salva é um texto único (etiquetas + texto
  // livre já combinados), então joga tudo em "Justificativa" pra edição
  // livre, sem tentar adivinhar quais pedaços eram etiqueta ou texto
  // livre originalmente.
  function abrirModalEdicaoItem(item: ItemOrcamento) {
    setEditandoItemId(item.id);
    setNovoItem({
      produto_servico_id: item.produto_servico_id ? String(item.produto_servico_id) : '',
      quantidade: String(item.quantidade),
      descricao_servico: item.descricao_servico ?? '',
    });
    setObservacoesSelecionadas([]);
    setObservacaoParaAdicionar('');
    setJustificativaLivre(item.observacao ?? '');
    setFotoItem(null);
    setErro(null);
    setModalAberto(true);
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
    if (!orcamentoQuery.data) return;
    if (!novoItem.produto_servico_id && !novoItem.descricao_servico.trim()) {
      setErro('Selecione um produto/serviço do catálogo ou descreva o serviço prestado.');
      return;
    }
    setErro(null);
    try {
      // Junta as etiquetas de defeito (lista fixa) com a justificativa em
      // texto livre - o resultado vira a "Observação / motivo da troca" que
      // aparece no relatório da OS enviado ao cliente.
      const etiquetas = observacoesSelecionadas.join('; ');
      const justificativa = justificativaLivre.trim();
      const observacaoFinal = [etiquetas, justificativa].filter(Boolean).join(' — ') || null;
      const camposComuns = {
        produto_servico_id: novoItem.produto_servico_id ? Number(novoItem.produto_servico_id) : null,
        quantidade: Number(novoItem.quantidade) || 1,
        observacao: observacaoFinal,
        descricao_servico: novoItem.descricao_servico.trim() || null,
      };
      if (editandoItemId) {
        // Só troca a foto se uma nova foi escolhida - sem isso, editar
        // item sem mexer na foto apagaria a foto já anexada.
        const fotoPath = fotoItem
          ? await enviarArquivoStorage(`orcamento_${orcamentoQuery.data.id}`, fotoItem)
          : undefined;
        const { error } = await supabase
          .from('orcamento_itens')
          .update({ ...camposComuns, ...(fotoPath !== undefined ? { foto_peca_danificada_path: fotoPath } : {}) })
          .eq('id', editandoItemId);
        if (error) throw error;
      } else {
        const fotoPath = fotoItem ? await enviarArquivoStorage(`orcamento_${orcamentoQuery.data.id}`, fotoItem) : null;
        const { error } = await supabase.from('orcamento_itens').insert({
          orcamento_id: orcamentoQuery.data.id,
          ...camposComuns,
          foto_peca_danificada_path: fotoPath,
        });
        if (error) throw error;
      }
      setModalAberto(false);
      setEditandoItemId(null);
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

  // Adicionar/trocar foto de um item já existente - independe de `travado`
  // de propósito: é só uma evidência anexada, não muda preço/descrição/
  // quantidade, então continua permitido mesmo em orçamentos já
  // precificados/entregues (ex.: complementar fotos depois da entrega).
  // Input por item, dentro de um <label> (mesmo padrão já usado em
  // TesteResolucao.tsx) - mais confiável entre navegadores do que abrir o
  // seletor de arquivo via ref + .click() programático.
  const [itemEnviandoFoto, setItemEnviandoFoto] = useState<number | null>(null);

  async function aoEscolherFotoItem(itemId: number, e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo || !orcamentoQuery.data) return;
    setItemEnviandoFoto(itemId);
    setErro(null);
    try {
      const caminho = await enviarArquivoStorage(`orcamento_${orcamentoQuery.data.id}`, arquivo);
      const { error } = await supabase.from('orcamento_itens').update({ foto_peca_danificada_path: caminho }).eq('id', itemId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['itens-orcamento', orcamentoQuery.data.id] });
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setItemEnviandoFoto(null);
    }
  }

  // Desbloqueia a OS (tela Registro de Entrada) excluindo o orçamento
  // inteiro - só funciona enquanto ainda está em "Aguardando Precificação"
  // (RLS): se o financeiro já começou a precificar, primeiro ele precisa
  // reverter a precificação (Orçamento Financeiro) antes disso funcionar.
  async function excluirOrcamentoTecnico() {
    if (!orcamentoQuery.data) return;
    setErro(null);
    setExcluindo(true);
    try {
      const idExcluido = orcamentoQuery.data.id;
      const { error } = await supabase.from('orcamentos').delete().eq('id', idExcluido);
      if (error) throw error;
      // Se ainda sobrar outro orçamento (alternativo) nesta OS, fica na
      // tela mostrando ele - só volta pra busca quando era o último.
      const restantes = (orcamentosOSQuery.data ?? []).filter((o) => o.id !== idExcluido);
      setOrcamentoIdSelecionado(null);
      if (restantes.length === 0) {
        setOsId('');
      } else {
        await qc.invalidateQueries({ queryKey: ['orcamentos-da-os', osId] });
      }
      qc.invalidateQueries({ queryKey: ['ordens-servico-para-orcamento-tecnico'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setExcluindo(false);
    }
  }

  function finalizar() {
    // O status da OS já foi sincronizado pelo gatilho no banco assim que
    // o orçamento foi criado (status "Aguardando Precificação") - aqui só
    // precisa navegar de volta.
    navigate('/ordens-servico');
  }

  // Relatório técnico das avarias identificadas - sem preço (isso é
  // trabalho do financeiro, na precificação). O técnico usa isso pra
  // mostrar ao cliente o que foi constatado, antes mesmo do orçamento
  // ser precificado e enviado.
  async function imprimirRelatorioTecnico() {
    if (!orcamentoQuery.data || !osDetalheQuery.data) return;
    const itens: ItemRelatorioOS[] = await Promise.all(
      (itensQuery.data ?? []).map(async (item) => ({
        nome: nomeItem(item),
        quantidade: item.quantidade,
        observacao: item.observacao,
        fotoUrl: item.foto_peca_danificada_path ? await urlAssinadaFoto(item.foto_peca_danificada_path) : null,
      })),
    );
    const c = clienteQuery.data;
    const clienteEndereco = c
      ? [[c.logradouro, c.numero_endereco].filter(Boolean).join(', '), c.complemento, c.bairro, c.cep ? `CEP ${c.cep}` : null]
          .filter(Boolean)
          .join(' - ')
      : '';
    imprimirRelatorioOS(
      clienteQuery.data,
      {
        ...osDetalheQuery.data,
        observacoes_tecnico: observacoesGerais.trim() || null,
        cliente_cnpj: c?.cnpj ?? null,
        cliente_fantasia: c?.nome_fantasia ?? null,
        cliente_endereco: clienteEndereco || null,
        cliente_cidade: c?.cidade ?? null,
        cliente_uf: c?.uf ?? null,
        cliente_telefone: c?.telefone ?? null,
        cliente_email: c?.email ?? null,
      },
      itens,
    );
  }

  function nomeItem(item: ItemOrcamento) {
    if (item.produto_servico_id) return produtosQuery.data?.find((p) => p.id === item.produto_servico_id)?.nome ?? '-';
    return item.descricao_servico ?? '-';
  }

  // Travado (Trilha A): assim que o financeiro começa a precificar (status
  // sai de "Aguardando Precificação"), o técnico não edita mais os itens.
  const travado = orcamentoQuery.data?.status !== 'Aguardando Precificação';

  return (
    <div>
      <h1>Montar orçamento (técnico)</h1>

      <div className="campo-form" style={{ maxWidth: 420 }}>
        <label>Ordem de serviço</label>
        <ComboboxBusca
          opcoes={opcoesOSQuery.data ?? []}
          valor={osId}
          onChange={(v) => {
            setOsId(v);
            setOrcamentoIdSelecionado(null);
          }}
        />
        <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
          Mostra OS em triagem (orçamento novo) e OS com orçamento já iniciado, ainda não enviado ao financeiro.
        </p>
      </div>

      {osId && osDetalheQuery.data && (
        <AlertaGarantia
          clienteId={osDetalheQuery.data.cliente_id}
          numeroSerie={osDetalheQuery.data.optica_sn}
          ordemServicoIdAtual={Number(osId)}
        />
      )}

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
          {(orcamentosOSQuery.data?.length ?? 0) > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {orcamentosOSQuery.data!.map((o) => (
                <button
                  key={o.id}
                  className={o.id === orcamentoQuery.data!.id ? 'botao-primario botao-pequeno' : 'botao-secundario botao-pequeno'}
                  onClick={() => setOrcamentoIdSelecionado(o.id)}
                  title={o.status}
                >
                  {o.numero_orcamento}
                </button>
              ))}
            </div>
          )}
          <div className="crud-cabecalho">
            <p className="mono" style={{ color: 'var(--ink-400)' }}>
              {orcamentoQuery.data.numero_orcamento} — {orcamentoQuery.data.status}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="botao-secundario botao-pequeno"
                title="Cria outro orçamento pra mesma OS com um escopo de manutenção diferente - ex.: cliente escolhe entre só o que pediu ou incluir mais uma peça identificada no teste"
                onClick={criarOrcamentoAlternativo}
                disabled={criandoAlternativo}
              >
                {criandoAlternativo
                  ? 'Criando...'
                  : `+ Orçamento alternativo (Opção ${(orcamentosOSQuery.data?.length ?? 1) + 1})`}
              </button>
              <button className="botao-primario botao-pequeno" onClick={abrirModalItem} disabled={travado}>
                <IconPlus size={16} /> Adicionar item
              </button>
            </div>
          </div>
          {travado && (
            <p style={{ fontSize: 12, color: 'var(--copper-500)' }}>
              Este orçamento já foi precificado - peça ao financeiro reverter a precificação pra editar os itens de
              novo.
            </p>
          )}

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
                  <td>{nomeItem(item)}</td>
                  <td>{item.quantidade}</td>
                  <td>{item.observacao}</td>
                  <td className="acoes-tabela">
                    {item.foto_peca_danificada_path && (
                      <button className="botao-icone" title="Ver foto" onClick={() => verFoto(item.foto_peca_danificada_path)}>
                        <IconPhoto size={16} />
                      </button>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      title={item.foto_peca_danificada_path ? 'Trocar foto' : 'Adicionar foto'}
                      disabled={itemEnviandoFoto === item.id}
                      style={{ width: 130, fontSize: 11 }}
                      onChange={(e) => aoEscolherFotoItem(item.id, e)}
                    />
                    <button className="botao-icone" title="Editar item" onClick={() => abrirModalEdicaoItem(item)} disabled={travado}>
                      <IconPencil size={16} />
                    </button>
                    <button className="botao-icone perigo" title="Remover" onClick={() => excluirItem(item.id)} disabled={travado}>
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
          {itemEnviandoFoto != null && <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>Enviando foto...</p>}

          <div className="campo-form" style={{ marginTop: 16 }}>
            <label>Observações técnicas gerais (defeito/serviço quando não há troca de peça)</label>
            <textarea
              placeholder="Ex: peça travada por acúmulo de resíduo - resolvido com limpeza e lubrificação, sem substituição de peças."
              value={observacoesGerais}
              onChange={(e) => setObservacoesGerais(e.target.value)}
              disabled={travado}
            />
            <button className="botao-secundario botao-pequeno" onClick={salvarObservacoesGerais} disabled={salvandoObs || travado} style={{ marginTop: 6 }}>
              {salvandoObs ? 'Salvando...' : 'Salvar observações'}
            </button>
          </div>

          {erro && <p className="erro-login">{erro}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              className="botao-secundario"
              onClick={imprimirRelatorioTecnico}
              disabled={(itensQuery.data ?? []).length === 0 && !observacoesGerais.trim()}
            >
              Imprimir Ordem de Serviços - Laudo Técnico
            </button>
            <button className="botao-primario" onClick={finalizar}>
              Finalizar identificação de danos
            </button>
            {(!travado || orcamentoQuery.data.status === 'Recusado') && (
              <button
                className="botao-secundario perigo"
                disabled={excluindo}
                onClick={() =>
                  pedirConfirmacao(excluirOrcamentoTecnico, {
                    titulo: 'Excluir orçamento',
                    mensagem:
                      (orcamentosOSQuery.data?.length ?? 0) > 1
                        ? `Confirma excluir o orçamento ${orcamentoQuery.data?.numero_orcamento} inteiro (com todos os itens)? Os outros orçamentos alternativos desta OS não são afetados. Não pode ser desfeito.`
                        : `Confirma excluir o orçamento ${orcamentoQuery.data?.numero_orcamento} inteiro (com todos os itens)? Isso libera a OS pra edição na tela de Registro de Entrada. Não pode ser desfeito.`,
                  })
                }
              >
                {excluindo ? 'Excluindo...' : 'Excluir orçamento'}
              </button>
            )}
          </div>
        </div>
      )}
      {ModalConfirmacao}

      {modalAberto && (
        <ModalJanela titulo={editandoItemId ? 'Editar item' : 'Adicionar item'} aoFechar={() => setModalAberto(false)}>
            <div className="campo-form">
              <label>Peça ou serviço (deixe em branco se for só mão de obra)</label>
              <ComboboxBusca
                opcoes={produtosFiltrados.map((p) => ({ value: String(p.id), label: p.nome }))}
                valor={String(novoItem.produto_servico_id ?? '')}
                onChange={(valor) => setNovoItem((f) => ({ ...f, produto_servico_id: valor }))}
              />
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                Só mostra peças/serviços (nunca equipamentos).
              </p>
            </div>
            <div className="campo-form">
              <label>Serviço prestado (quando não há troca de peça)</label>
              <textarea
                placeholder="Ex: limpeza e ajuste de foco, sem troca de peças"
                value={novoItem.descricao_servico}
                onChange={(e) => setNovoItem((f) => ({ ...f, descricao_servico: e.target.value }))}
              />
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
                <div style={{ flex: 1 }}>
                  <ComboboxBusca
                    opcoes={observacoesFiltradas
                      .filter((o) => !observacoesSelecionadas.includes(o.descricao))
                      .map((o) => ({ value: o.descricao, label: o.descricao }))}
                    valor={observacaoParaAdicionar}
                    onChange={setObservacaoParaAdicionar}
                  />
                </div>
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
                {produtoDoItem?.categoria
                  ? `Mostrando observações do grupo "${produtoDoItem.categoria}"${produtoDoItem.subgrupo ? ` / subgrupo "${produtoDoItem.subgrupo}"` : ''} + as sem grupo definido. `
                  : ''}
                Não achou a observação certa? Cadastre em "Observações de defeito" (Cadastros Gerais).
              </p>
            </div>
            <div className="campo-form">
              <label>Justificativa / motivo da troca (texto livre, opcional)</label>
              <textarea
                placeholder="Ex: infiltração comprometeu o conjunto de lentes - troca recomendada"
                value={justificativaLivre}
                onChange={(e) => setJustificativaLivre(e.target.value)}
              />
              <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                {editandoItemId
                  ? 'Ao editar, a observação atual do item inteira aparece aqui pra edição livre.'
                  : 'Complementa as etiquetas acima e aparece junto delas no relatório enviado ao cliente.'}
              </p>
            </div>
            <div className="campo-form">
              <label>Foto da peça danificada (opcional{editandoItemId ? ' - deixe em branco pra manter a foto atual' : ''})</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" accept="image/*" onChange={(e) => setFotoItem(e.target.files?.[0] ?? null)} />
                <CapturaFoto onCapturar={(arquivo) => setFotoItem(arquivo)} />
              </div>
              {fotoItem && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
                  <span>{fotoItem.name}</span>
                  <button
                    type="button"
                    className="botao-icone perigo"
                    title="Remover foto selecionada"
                    onClick={() => setFotoItem(null)}
                  >
                    <IconX size={14} />
                  </button>
                </div>
              )}
            </div>

            {erro && <p className="erro-login">{erro}</p>}

            <div className="modal-acoes">
              <button className="botao-secundario" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button className="botao-primario" onClick={adicionarItem}>
                {editandoItemId ? 'Salvar' : 'Adicionar item'}
              </button>
            </div>
        </ModalJanela>
      )}
    </div>
  );
}
