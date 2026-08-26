import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
import { useFiltrosColuna } from '../../lib/useFiltrosColuna';
import { FiltroColunaValores } from '../../components/FiltroColunaValores';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { useAuth } from '../../contexts/AuthContext';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { ModalJanela } from '../../components/ModalJanela';
import { useRascunhoDeTela } from '../../lib/useRascunhoDeTela';
import { Badge } from '../../components/Badge';
import { LaudoPdf } from './LaudoPdf';
import { LaudoEquipamentoPdf } from './LaudoEquipamentoPdf';
import { ComboboxBusca } from '../../components/ComboboxBusca';
import { IconTrash } from '@tabler/icons-react';

interface Laudo {
  id: number;
  numero_laudo: string;
  ordem_servico_id: number;
  tecnico_responsavel: string | null;
  resultado: string;
  storage_path: string | null;
  data_emissao: string;
  tipo_laudo: string | null;
  tipo_equipamento_laudo_id: number | null;
  tipo_manutencao: string | null;
  data_validade: string | null;
}

type TipoLaudo = 'equipamento' | 'nota';
type TipoManutencao = 'Corretiva' | 'Preventiva';

// 'diagnostico'/'servico' não são mais gerados (o defeito identificado
// agora sai direto da Ordem de Serviço, botão "Ordem de Serviços - Laudo
// Técnico") - o rótulo continua aqui só pra laudos antigos já emitidos
// não aparecerem como "undefined" na lista.
const LABEL_TIPO_LAUDO: Record<string, string> = {
  diagnostico: 'Diagnóstico (antigo)',
  servico: 'Serviço executado (antigo)',
  equipamento: 'Laudo de equipamento',
  nota: 'Nota interna',
};

async function gerarNumeroLaudo(): Promise<string> {
  return gerarNumeroSequencial('LAUDO', 'laudos', 'numero_laudo');
}

const COLUNAS_FILTRAVEIS = [
  'numero_laudo',
  'numero_os',
  'cliente_nome',
  'tipo_laudo',
  'tipo_equipamento',
  'tipo_manutencao',
  'tecnico_responsavel',
  'resultado',
  'data_emissao',
];

export function Laudos() {
  const navigate = useNavigate();
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const { opcoes: opcoesOS, porId } = useOrdensServicoOpcoes();
  const [modalAberto, setModalAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tipoLaudo, setTipoLaudo] = useState<TipoLaudo>('equipamento');
  const [form, setForm] = useState({
    ordem_servico_id: '',
    tipo_equipamento_laudo_id: '',
    tipo_manutencao: 'Corretiva' as TipoManutencao,
    resultado: 'Aprovado',
    observacoes_tecnicas: '',
  });
  const [respostas, setRespostas] = useState<Record<number, boolean | null>>({});
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();

  const tiposEquipamentoQuery = useQuery({
    queryKey: ['tipos-equipamento-laudo-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_equipamento_laudo')
        .select('id, descricao')
        .eq('status_ativo', true)
        .order('descricao');
      if (error) throw error;
      return data as { id: number; descricao: string }[];
    },
  });

  const checklistItensQuery = useQuery({
    queryKey: ['checklist-laudo-itens', form.tipo_equipamento_laudo_id],
    enabled: tipoLaudo === 'equipamento' && !!form.tipo_equipamento_laudo_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_laudo_itens')
        .select('id, descricao, ordem')
        .eq('tipo_equipamento_laudo_id', Number(form.tipo_equipamento_laudo_id))
        .eq('status_ativo', true)
        .order('ordem');
      if (error) throw error;
      return data as { id: number; descricao: string; ordem: number }[];
    },
  });

  function nomeTipoEquipamento(id: number | null) {
    if (!id) return null;
    return tiposEquipamentoQuery.data?.find((t) => t.id === id)?.descricao ?? null;
  }

  function escolherTipoEquipamento(valor: string) {
    setForm((f) => ({ ...f, tipo_equipamento_laudo_id: valor }));
    setRespostas({});
  }

  function marcarTodosConforme() {
    const novo: Record<number, boolean | null> = {};
    (checklistItensQuery.data ?? []).forEach((it) => {
      novo[it.id] = true;
    });
    setRespostas(novo);
  }

  // Puxa os dados de cabeçalho da OS/equipamento/cliente completo pra não
  // precisar redigitar no laudo (cliente com CNPJ/endereço, unidade
  // atendida, equipamento, data de abertura) - laudo formal precisa da
  // identificação completa do cliente, não só o nome.
  const dadosOSQuery = useQuery({
    queryKey: ['laudo-dados-os', form.ordem_servico_id],
    enabled: !!form.ordem_servico_id && tipoLaudo !== 'nota',
    queryFn: async () => {
      const osId = Number(form.ordem_servico_id);
      const { data: os, error: errOS } = await supabase
        .from('ordens_servico')
        .select('numero_os, cliente_id, cliente_nome, cliente_final_id, optica_desc, optica_fab, optica_sn, data_abertura')
        .eq('id', osId)
        .single();
      if (errOS) throw errOS;

      const { data: cliente } = await supabase
        .from('clientes')
        .select('razao_social, nome_fantasia, cnpj, telefone, email, logradouro, numero_endereco, complemento, bairro, cidade, uf, cep')
        .eq('id', os.cliente_id)
        .maybeSingle();

      let clienteFinalNome: string | null = null;
      if (os.cliente_final_id) {
        const { data: cf } = await supabase.from('clientes').select('razao_social').eq('id', os.cliente_final_id).maybeSingle();
        clienteFinalNome = cf?.razao_social ?? null;
      }

      return { os, cliente, clienteFinalNome };
    },
  });

  const { minimizar: minimizarRascunho } = useRascunhoDeTela('laudos', {
    titulo: 'Novo laudo',
    obterEstado: () => ({ form, tipoLaudo, respostas }),
    aoRestaurar: (e) => {
      setForm(
        (e.form as typeof form) ?? {
          ordem_servico_id: '',
          tipo_equipamento_laudo_id: '',
          tipo_manutencao: 'Corretiva',
          resultado: 'Aprovado',
          observacoes_tecnicas: '',
        },
      );
      setTipoLaudo((e.tipoLaudo as TipoLaudo) ?? 'equipamento');
      setRespostas((e.respostas as Record<number, boolean | null>) ?? {});
      setErro(null);
      setModalAberto(true);
    },
  });

  function minimizarLaudo() {
    minimizarRascunho();
    setModalAberto(false);
  }

  const laudosQuery = useQuery({
    queryKey: ['laudos'],
    queryFn: async (): Promise<Laudo[]> => {
      const { data, error } = await supabase
        .from('laudos')
        .select(
          'id, numero_laudo, ordem_servico_id, tecnico_responsavel, resultado, storage_path, data_emissao, tipo_laudo, tipo_equipamento_laudo_id, tipo_manutencao, data_validade',
        )
        .order('data_emissao', { ascending: false });
      if (error) throw error;
      return data as Laudo[];
    },
  });

  function valorColuna(l: Laudo, chave: string): unknown {
    if (chave === 'numero_os') return porId(l.ordem_servico_id)?.numero_os ?? `#${l.ordem_servico_id}`;
    if (chave === 'cliente_nome') return porId(l.ordem_servico_id)?.cliente_nome ?? '';
    if (chave === 'tipo_laudo') return l.tipo_laudo ? (LABEL_TIPO_LAUDO[l.tipo_laudo] ?? l.tipo_laudo) : 'ISO 8600 / outro';
    if (chave === 'tipo_equipamento') return nomeTipoEquipamento(l.tipo_equipamento_laudo_id) ?? '-';
    if (chave === 'tipo_manutencao') return l.tipo_manutencao ?? '-';
    if (chave === 'data_emissao') return l.data_emissao;
    return (l as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (laudosQuery.data ?? []).filter((l) =>
    COLUNAS_FILTRAVEIS.every((chave) => passaFiltro(valorColuna(l, chave), chave)),
  );
  const { linhasOrdenadas: linhas, coluna, direcao, ordenarPor } = useLinhasOrdenadas(linhasFiltradas, null, valorColuna);

  async function baixarPdf(caminho: string | null) {
    if (!caminho) return;
    const { data, error } = await supabase.storage.from('laudos-pdf').createSignedUrl(caminho, 3600);
    if (error || !data) {
      alert(mensagemErro(error));
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  async function excluirLaudo(l: Laudo) {
    if (!confirm(`Confirma excluir o laudo ${l.numero_laudo}? Essa ação não pode ser desfeita.`)) return;
    try {
      if (l.storage_path) {
        await supabase.storage.from('laudos-pdf').remove([l.storage_path]);
      }
      const { error } = await supabase.from('laudos').delete().eq('id', l.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['laudos'] });
    } catch (e) {
      alert(mensagemErro(e));
    }
  }

  async function gerarLaudo() {
    setErro(null);
    if (!form.ordem_servico_id) {
      setErro('Selecione a ordem de serviço.');
      return;
    }
    if (tipoLaudo === 'equipamento' && !form.tipo_equipamento_laudo_id) {
      setErro('Selecione o tipo de equipamento.');
      return;
    }
    const os = porId(Number(form.ordem_servico_id));
    setGerando(true);
    try {
      const numeroLaudo = await gerarNumeroLaudo();
      const agora = new Date();
      const dataEmissao = agora.toLocaleDateString('pt-BR');
      // Válido por 12 meses - padrão de laudo técnico de manutenção
      // (mesmo horizonte usado na calibração de padrões).
      const validade = new Date(agora);
      validade.setFullYear(validade.getFullYear() + 1);
      const dataValidadeIso = validade.toISOString().slice(0, 10);
      const equipamentoDesc = [dadosOSQuery.data?.os.optica_desc, dadosOSQuery.data?.os.optica_fab].filter(Boolean).join(' - ');
      const numeroSerie = dadosOSQuery.data?.os.optica_sn ?? '';
      const clienteFinalNome = dadosOSQuery.data?.clienteFinalNome ?? null;
      const cliente = dadosOSQuery.data?.cliente ?? null;
      const clienteEndereco = cliente
        ? [
            [cliente.logradouro, cliente.numero_endereco].filter(Boolean).join(', '),
            cliente.complemento,
            cliente.bairro,
            cliente.cep ? `CEP ${cliente.cep}` : null,
          ]
            .filter(Boolean)
            .join(' - ')
        : '';
      const dataAbertura = dadosOSQuery.data?.os.data_abertura
        ? new Date(dadosOSQuery.data.os.data_abertura).toLocaleDateString('pt-BR')
        : '';

      let blob: Blob;
      let itensChecklist: { descricao: string; conforme: boolean | null }[] = [];
      if (tipoLaudo === 'equipamento') {
        const tipoNome = nomeTipoEquipamento(Number(form.tipo_equipamento_laudo_id)) ?? '';
        itensChecklist = (checklistItensQuery.data ?? []).map((it) => ({
          descricao: it.descricao,
          conforme: respostas[it.id] ?? null,
        }));
        blob = await pdf(
          <LaudoEquipamentoPdf
            dados={{
              numeroLaudo,
              numeroOS: os?.numero_os ?? '',
              tipoManutencao: form.tipo_manutencao,
              clienteNome: cliente?.razao_social ?? os?.cliente_nome ?? '',
              clienteFantasia: cliente?.nome_fantasia ?? '',
              clienteCnpj: cliente?.cnpj ?? '',
              clienteEndereco,
              clienteCidade: cliente?.cidade ?? '',
              clienteUf: cliente?.uf ?? '',
              clienteTelefone: cliente?.telefone ?? '',
              clienteEmail: cliente?.email ?? '',
              clienteFinalNome,
              tipoEquipamento: tipoNome,
              equipamentoDesc,
              numeroSerie,
              itens: itensChecklist,
              observacoes: form.observacoes_tecnicas,
              resultado: form.resultado,
              tecnicoResponsavel: funcionario?.nome ?? '',
              dataAbertura,
              dataEmissao,
              dataValidade: validade.toLocaleDateString('pt-BR'),
            }}
          />,
        ).toBlob();
      } else {
        blob = await pdf(
          <LaudoPdf
            dados={{
              numeroLaudo,
              numeroOS: os?.numero_os ?? '',
              clienteNome: os?.cliente_nome ?? '',
              equipamentoDesc: '',
              tecnicoResponsavel: funcionario?.nome ?? '',
              resultado: form.resultado,
              observacoesTecnicas: form.observacoes_tecnicas,
              dataEmissao,
            }}
          />,
        ).toBlob();
      }

      const caminho = `laudo_${form.ordem_servico_id}/${numeroLaudo}.pdf`;
      // upsert: true - o número pode colidir com um arquivo órfão de um
      // laudo excluído antes (a exclusão apaga o registro e o arquivo
      // juntos, mas um número já reaproveitado sem o arquivo remover não
      // pode travar a geração de um novo laudo com "resource already exists").
      const { error: erroUpload } = await supabase.storage.from('laudos-pdf').upload(caminho, blob, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (erroUpload) throw erroUpload;

      const { error: erroInsert } = await supabase.from('laudos').insert({
        numero_laudo: numeroLaudo,
        ordem_servico_id: Number(form.ordem_servico_id),
        tecnico_responsavel: funcionario?.nome ?? null,
        resultado: form.resultado,
        observacoes_tecnicas: form.observacoes_tecnicas || null,
        storage_path: caminho,
        tipo_laudo: tipoLaudo,
        tipo_equipamento_laudo_id: tipoLaudo === 'equipamento' ? Number(form.tipo_equipamento_laudo_id) : null,
        checklist_respostas: tipoLaudo === 'equipamento' ? itensChecklist : null,
        tipo_manutencao: tipoLaudo === 'equipamento' ? form.tipo_manutencao : null,
        data_validade: tipoLaudo === 'equipamento' ? dataValidadeIso : null,
      });
      if (erroInsert) throw erroInsert;

      setModalAberto(false);
      setTipoLaudo('equipamento');
      setForm({
        ordem_servico_id: '',
        tipo_equipamento_laudo_id: '',
        tipo_manutencao: 'Corretiva',
        resultado: 'Aprovado',
        observacoes_tecnicas: '',
      });
      setRespostas({});
      qc.invalidateQueries({ queryKey: ['laudos'] });
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setGerando(false);
    }
  }

  if (laudosQuery.isLoading) return <CarregandoTela />;

  return (
    <div>
      <div className="crud-cabecalho">
        <h1>Laudos e notas técnicas</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {algumFiltroAtivo && (
            <button className="botao-secundario botao-pequeno" onClick={limparTudo}>
              Limpar filtros
            </button>
          )}
          <button className="botao-primario botao-pequeno" onClick={() => setModalAberto(true)}>
            Novo laudo
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 12px', maxWidth: 760 }}>
        Os <strong>laudos de conformidade ISO 8600</strong> (com medições e critérios) são gerados na
        <strong> Bancada de Visão</strong> e no <strong>Teste de resolução</strong> - pra equipamentos ópticos. O
        defeito identificado ao cliente sai direto da Ordem de Serviço, no botão "Imprimir Ordem de Serviços - Laudo
        Técnico" (tela Montar orçamento). Aqui você gera o <strong>Laudo de equipamento</strong> (checklist de
        manutenção por tipo de equipamento, ex: consoles/fontes de luz) ou uma nota interna simples.
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['numero_laudo', 'Nº laudo'],
              ['numero_os', 'OS'],
              ['cliente_nome', 'Cliente'],
              ['tipo_laudo', 'Tipo'],
              ['tipo_equipamento', 'Equipamento'],
              ['tipo_manutencao', 'Manutenção'],
              ['tecnico_responsavel', 'Técnico'],
              ['resultado', 'Resultado'],
              ['data_emissao', 'Emitido em'],
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
                new Set((laudosQuery.data ?? []).map((l) => String(valorColuna(l, chave) ?? ''))),
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
          {linhas.map((l) => (
            <tr key={l.id}>
              <td className="mono">{l.numero_laudo}</td>
              <td>
                <span
                  className="link-numero mono"
                  onClick={() => navigate(`/orcamento-tecnico?os=${l.ordem_servico_id}`)}
                >
                  {porId(l.ordem_servico_id)?.numero_os ?? `#${l.ordem_servico_id}`}
                </span>
              </td>
              <td>{porId(l.ordem_servico_id)?.cliente_nome ?? '-'}</td>
              <td>{l.tipo_laudo ? (LABEL_TIPO_LAUDO[l.tipo_laudo] ?? l.tipo_laudo) : <span style={{ color: 'var(--ink-400)' }}>ISO 8600 / outro</span>}</td>
              <td>{nomeTipoEquipamento(l.tipo_equipamento_laudo_id) ?? '-'}</td>
              <td>{l.tipo_manutencao ?? '-'}</td>
              <td>{l.tecnico_responsavel}</td>
              <td>
                <Badge tono={l.resultado === 'Aprovado' ? 'teal' : 'danger'}>{l.resultado}</Badge>
              </td>
              <td>{new Date(l.data_emissao).toLocaleDateString('pt-BR')}</td>
              <td className="acoes-tabela">
                <button className="botao-secundario" onClick={() => baixarPdf(l.storage_path)}>
                  Baixar PDF
                </button>
                <button className="botao-icone perigo" title="Excluir laudo" onClick={() => excluirLaudo(l)}>
                  <IconTrash size={16} />
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={10}>Nenhum laudo encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <ModalJanela titulo="Novo laudo" aoFechar={() => setModalAberto(false)} aoMinimizar={minimizarLaudo}>
          <div className="campo-form">
            <label>Tipo de laudo *</label>
            <select value={tipoLaudo} onChange={(e) => setTipoLaudo(e.target.value as TipoLaudo)}>
              <option value="equipamento">Laudo de equipamento (checklist de manutenção)</option>
              <option value="nota">Nota interna simples (texto livre)</option>
            </select>
          </div>
          <div className="campo-form">
            <label>Ordem de serviço *</label>
            <ComboboxBusca
              opcoes={opcoesOS}
              valor={String(form.ordem_servico_id ?? '')}
              onChange={(valor) => setForm((f) => ({ ...f, ordem_servico_id: valor }))}
            />
            <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
              Cliente, unidade atendida e equipamento dessa OS são puxados automaticamente.
            </p>
          </div>

          {tipoLaudo === 'equipamento' && form.ordem_servico_id && (
            <>
              <div
                style={{
                  background: 'var(--paper-50)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                {dadosOSQuery.isLoading ? (
                  <p style={{ margin: 0 }}>Carregando dados da OS...</p>
                ) : (
                  <>
                    <p style={{ margin: 0 }}>
                      <strong>Cliente:</strong> {dadosOSQuery.data?.cliente?.razao_social ?? dadosOSQuery.data?.os.cliente_nome}
                      {dadosOSQuery.data?.cliente?.cnpj ? ` · CNPJ ${dadosOSQuery.data.cliente.cnpj}` : ''}
                      {dadosOSQuery.data?.clienteFinalNome ? ` (unidade: ${dadosOSQuery.data.clienteFinalNome})` : ''}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Equipamento:</strong>{' '}
                      {[dadosOSQuery.data?.os.optica_desc, dadosOSQuery.data?.os.optica_fab].filter(Boolean).join(' - ') || '-'}
                      {dadosOSQuery.data?.os.optica_sn ? ` · Nº série ${dadosOSQuery.data.os.optica_sn}` : ''}
                    </p>
                  </>
                )}
              </div>

              <div className="campo-form">
                <label>Tipo de manutenção *</label>
                <select
                  value={form.tipo_manutencao}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_manutencao: e.target.value as TipoManutencao }))}
                >
                  <option value="Corretiva">Corretiva (reparo de defeito identificado)</option>
                  <option value="Preventiva">Preventiva (manutenção programada, sem defeito relatado)</option>
                </select>
              </div>

              <div className="campo-form">
                <label>Tipo de equipamento *</label>
                <ComboboxBusca
                  opcoes={(tiposEquipamentoQuery.data ?? []).map((t) => ({ value: String(t.id), label: t.descricao }))}
                  valor={String(form.tipo_equipamento_laudo_id ?? '')}
                  onChange={escolherTipoEquipamento}
                  placeholder="Buscar tipo de equipamento..."
                />
                <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>
                  Define qual checklist aparece abaixo. Cadastre novos tipos em "Cadastros gerais" › "Tipos de
                  equipamento (laudo)".
                </p>
              </div>

              {form.tipo_equipamento_laudo_id && (
                <div className="campo-form">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ marginBottom: 0 }}>Checklist</label>
                    {(checklistItensQuery.data ?? []).length > 0 && (
                      <button type="button" className="botao-secundario botao-pequeno" onClick={marcarTodosConforme}>
                        Marcar todos como C
                      </button>
                    )}
                  </div>
                  {checklistItensQuery.isLoading ? (
                    <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Carregando checklist...</p>
                  ) : (checklistItensQuery.data ?? []).length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
                      Nenhum item de checklist cadastrado para este tipo de equipamento ainda.
                    </p>
                  ) : (
                    <table className="tabela-crud" style={{ marginTop: 6 }}>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th style={{ width: 60, textAlign: 'center' }}>C</th>
                          <th style={{ width: 60, textAlign: 'center' }}>NC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(checklistItensQuery.data ?? []).map((it) => (
                          <tr key={it.id}>
                            <td>{it.descricao}</td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="radio"
                                name={`checklist-${it.id}`}
                                checked={respostas[it.id] === true}
                                onChange={() => setRespostas((r) => ({ ...r, [it.id]: true }))}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="radio"
                                name={`checklist-${it.id}`}
                                checked={respostas[it.id] === false}
                                onChange={() => setRespostas((r) => ({ ...r, [it.id]: false }))}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}

          {tipoLaudo === 'equipamento' && (
            <div className="campo-form">
              <label>Equipamento conforme parâmetros de funcionamento (resultado final)</label>
              <select value={form.resultado} onChange={(e) => setForm((f) => ({ ...f, resultado: e.target.value }))}>
                <option value="Aprovado">Aprovado</option>
                <option value="Reprovado">Reprovado</option>
              </select>
            </div>
          )}
          {tipoLaudo === 'nota' && (
            <div className="campo-form">
              <label>Resultado</label>
              <select value={form.resultado} onChange={(e) => setForm((f) => ({ ...f, resultado: e.target.value }))}>
                <option value="Aprovado">Aprovado</option>
                <option value="Reprovado">Reprovado</option>
              </select>
            </div>
          )}
          <div className="campo-form">
            <label>{tipoLaudo === 'nota' ? 'Observações técnicas' : 'Observações'}</label>
            <textarea
              value={form.observacoes_tecnicas}
              onChange={(e) => setForm((f) => ({ ...f, observacoes_tecnicas: e.target.value }))}
            />
          </div>

          {erro && <p className="erro-login">{erro}</p>}

          <div className="modal-acoes">
            <button className="botao-secundario" onClick={() => setModalAberto(false)} disabled={gerando}>
              Cancelar
            </button>
            <button className="botao-primario" onClick={gerarLaudo} disabled={gerando}>
              {gerando ? 'Gerando...' : 'Gerar laudo'}
            </button>
          </div>
        </ModalJanela>
      )}
    </div>
  );
}
