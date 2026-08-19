import { useState } from 'react';
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
import { LaudoDiagnosticoPdf } from './LaudoDiagnosticoPdf';
import { LaudoServicoPdf } from './LaudoServicoPdf';
import { ComboboxBusca } from '../../components/ComboboxBusca';

interface Laudo {
  id: number;
  numero_laudo: string;
  ordem_servico_id: number;
  tecnico_responsavel: string | null;
  resultado: string;
  storage_path: string | null;
  data_emissao: string;
  tipo_laudo: string | null;
}

type TipoLaudo = 'diagnostico' | 'servico' | 'nota';

const LABEL_TIPO_LAUDO: Record<string, string> = {
  diagnostico: 'Diagnóstico',
  servico: 'Serviço executado',
  nota: 'Nota interna',
};

async function gerarNumeroLaudo(): Promise<string> {
  return gerarNumeroSequencial('LAUDO', 'laudos', 'numero_laudo');
}

const COLUNAS_FILTRAVEIS = ['numero_laudo', 'numero_os', 'cliente_nome', 'tipo_laudo', 'tecnico_responsavel', 'resultado', 'data_emissao'];

export function Laudos() {
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const { opcoes: opcoesOS, porId } = useOrdensServicoOpcoes();
  const [modalAberto, setModalAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tipoLaudo, setTipoLaudo] = useState<TipoLaudo>('diagnostico');
  const [form, setForm] = useState({ ordem_servico_id: '', resultado: 'Aprovado', observacoes_tecnicas: '' });
  const {
    textos: filtrosColuna,
    setTexto: setFiltroTexto,
    valores: filtrosValores,
    setValoresColuna,
    passaFiltro,
    limparTudo,
    algumFiltroAtivo,
  } = useFiltrosColuna();

  // Puxa o defeito relatado e os itens do orçamento (com a observação de
  // defeito que o técnico já registrou ao montar o orçamento) - assim os
  // laudos de Diagnóstico/Serviço Executado nascem prontos, sem precisar
  // redigitar o que já foi identificado na Ordem de Serviço.
  const dadosOSQuery = useQuery({
    queryKey: ['laudo-dados-os', form.ordem_servico_id],
    enabled: !!form.ordem_servico_id && tipoLaudo !== 'nota',
    queryFn: async () => {
      const osId = Number(form.ordem_servico_id);
      const { data: os, error: errOS } = await supabase
        .from('ordens_servico')
        .select('numero_os, cliente_nome, cliente_final_id, optica_desc, optica_fab, optica_sn, defeito_relatado')
        .eq('id', osId)
        .single();
      if (errOS) throw errOS;

      const { data: orcamento } = await supabase
        .from('orcamentos')
        .select('id, observacoes_tecnico')
        .eq('ordem_servico_id', osId)
        .order('data_criacao', { ascending: false })
        .limit(1)
        .maybeSingle();

      let itens: { nome: string; quantidade: number; observacao: string | null }[] = [];
      if (orcamento) {
        const { data: itensData } = await supabase
          .from('orcamento_itens')
          .select('quantidade, observacao, descricao_servico, produtos_servicos(nome)')
          .eq('orcamento_id', orcamento.id);
        itens = (itensData ?? []).map((it) => ({
          nome: (it as unknown as { produtos_servicos: { nome: string } | null }).produtos_servicos?.nome ?? it.descricao_servico ?? '-',
          quantidade: it.quantidade,
          observacao: it.observacao,
        }));
      }

      let clienteFinalNome: string | null = null;
      if (os.cliente_final_id) {
        const { data: cf } = await supabase.from('clientes').select('razao_social').eq('id', os.cliente_final_id).maybeSingle();
        clienteFinalNome = cf?.razao_social ?? null;
      }

      return { os, orcamento, itens, clienteFinalNome };
    },
  });

  const { minimizar: minimizarRascunho } = useRascunhoDeTela('laudos', {
    titulo: 'Novo laudo',
    obterEstado: () => ({ form, tipoLaudo }),
    aoRestaurar: (e) => {
      setForm((e.form as typeof form) ?? { ordem_servico_id: '', resultado: 'Aprovado', observacoes_tecnicas: '' });
      setTipoLaudo((e.tipoLaudo as TipoLaudo) ?? 'diagnostico');
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
        .select('id, numero_laudo, ordem_servico_id, tecnico_responsavel, resultado, storage_path, data_emissao, tipo_laudo')
        .order('data_emissao', { ascending: false });
      if (error) throw error;
      return data as Laudo[];
    },
  });

  function valorColuna(l: Laudo, chave: string): unknown {
    if (chave === 'numero_os') return porId(l.ordem_servico_id)?.numero_os ?? `#${l.ordem_servico_id}`;
    if (chave === 'cliente_nome') return porId(l.ordem_servico_id)?.cliente_nome ?? '';
    if (chave === 'tipo_laudo') return l.tipo_laudo ? (LABEL_TIPO_LAUDO[l.tipo_laudo] ?? l.tipo_laudo) : 'ISO 8600 / outro';
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

  async function gerarLaudo() {
    setErro(null);
    if (!form.ordem_servico_id) {
      setErro('Selecione a ordem de serviço.');
      return;
    }
    const os = porId(Number(form.ordem_servico_id));
    setGerando(true);
    try {
      const numeroLaudo = await gerarNumeroLaudo();
      const dataEmissao = new Date().toLocaleDateString('pt-BR');
      const equipamentoDesc = [dadosOSQuery.data?.os.optica_desc, dadosOSQuery.data?.os.optica_fab].filter(Boolean).join(' - ');
      const numeroSerie = dadosOSQuery.data?.os.optica_sn ?? '';
      const clienteFinalNome = dadosOSQuery.data?.clienteFinalNome ?? null;

      let blob: Blob;
      if (tipoLaudo === 'diagnostico') {
        const itensComProblema = (dadosOSQuery.data?.itens ?? [])
          .filter((it) => it.observacao)
          .map((it) => ({ nome: it.nome, problema: it.observacao as string }));
        blob = await pdf(
          <LaudoDiagnosticoPdf
            dados={{
              numeroLaudo,
              numeroOS: os?.numero_os ?? '',
              clienteNome: os?.cliente_nome ?? '',
              clienteFinalNome,
              equipamentoDesc,
              numeroSerie,
              defeitoRelatado: dadosOSQuery.data?.os.defeito_relatado ?? '',
              itens: itensComProblema,
              observacoesAdicionais: form.observacoes_tecnicas,
              tecnicoResponsavel: funcionario?.nome ?? '',
              dataEmissao,
            }}
          />,
        ).toBlob();
      } else if (tipoLaudo === 'servico') {
        const todosItens = (dadosOSQuery.data?.itens ?? []).map((it) => ({ nome: it.nome, quantidade: it.quantidade }));
        const observacoesTecnicas = [dadosOSQuery.data?.orcamento?.observacoes_tecnico, form.observacoes_tecnicas]
          .filter(Boolean)
          .join('\n\n');
        blob = await pdf(
          <LaudoServicoPdf
            dados={{
              numeroLaudo,
              numeroOS: os?.numero_os ?? '',
              clienteNome: os?.cliente_nome ?? '',
              clienteFinalNome,
              equipamentoDesc,
              numeroSerie,
              itens: todosItens,
              observacoesTecnicas,
              resultado: form.resultado,
              tecnicoResponsavel: funcionario?.nome ?? '',
              dataEmissao,
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
      const { error: erroUpload } = await supabase.storage.from('laudos-pdf').upload(caminho, blob, {
        contentType: 'application/pdf',
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
      });
      if (erroInsert) throw erroInsert;

      setModalAberto(false);
      setTipoLaudo('diagnostico');
      setForm({ ordem_servico_id: '', resultado: 'Aprovado', observacoes_tecnicas: '' });
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
        <strong> Bancada de Visão</strong> e no <strong>Teste de resolução</strong> - pra equipamentos ópticos. Este
        botão gera os laudos de <strong>equipamentos não-ópticos (produtos)</strong>: Diagnóstico (o defeito
        identificado) e Serviço executado (o que foi feito), puxando automaticamente o que já foi registrado na
        Ordem de Serviço/Orçamento. Todos os documentos aparecem na lista abaixo.
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['numero_laudo', 'Nº laudo'],
              ['numero_os', 'OS'],
              ['cliente_nome', 'Cliente'],
              ['tipo_laudo', 'Tipo'],
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
              <td className="mono">{porId(l.ordem_servico_id)?.numero_os ?? `#${l.ordem_servico_id}`}</td>
              <td>{porId(l.ordem_servico_id)?.cliente_nome ?? '-'}</td>
              <td>{l.tipo_laudo ? (LABEL_TIPO_LAUDO[l.tipo_laudo] ?? l.tipo_laudo) : <span style={{ color: 'var(--ink-400)' }}>ISO 8600 / outro</span>}</td>
              <td>{l.tecnico_responsavel}</td>
              <td>
                <Badge tono={l.resultado === 'Aprovado' ? 'teal' : 'danger'}>{l.resultado}</Badge>
              </td>
              <td>{new Date(l.data_emissao).toLocaleDateString('pt-BR')}</td>
              <td className="acoes-tabela">
                <button className="botao-secundario" onClick={() => baixarPdf(l.storage_path)}>
                  Baixar PDF
                </button>
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={8}>Nenhum laudo encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <ModalJanela
          titulo="Novo laudo"
          aoFechar={() => setModalAberto(false)}
          aoMinimizar={minimizarLaudo}
        >
            <div className="campo-form">
              <label>Tipo de laudo *</label>
              <select value={tipoLaudo} onChange={(e) => setTipoLaudo(e.target.value as TipoLaudo)}>
                <option value="diagnostico">Diagnóstico (problema encontrado)</option>
                <option value="servico">Serviço executado (o que foi feito)</option>
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
                O defeito relatado e os itens já registrados no orçamento dessa OS são puxados automaticamente
                abaixo - não precisa redigitar.
              </p>
            </div>

            {tipoLaudo !== 'nota' && form.ordem_servico_id && (
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
                ) : tipoLaudo === 'diagnostico' ? (
                  <>
                    <p style={{ margin: 0 }}>
                      <strong>Defeito relatado:</strong> {dadosOSQuery.data?.os.defeito_relatado || 'Não informado'}
                    </p>
                    <p style={{ margin: '8px 0 4px' }}>
                      <strong>Problemas identificados por item:</strong>
                    </p>
                    {(dadosOSQuery.data?.itens ?? []).filter((it) => it.observacao).length === 0 ? (
                      <p style={{ margin: 0, color: 'var(--ink-400)' }}>
                        Nenhum item com observação de defeito registrada no orçamento.
                      </p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {(dadosOSQuery.data?.itens ?? [])
                          .filter((it) => it.observacao)
                          .map((it, i) => (
                            <li key={i}>
                              <strong>{it.nome}:</strong> {it.observacao}
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <p style={{ margin: '0 0 4px' }}>
                      <strong>Serviços/peças registrados no orçamento:</strong>
                    </p>
                    {(dadosOSQuery.data?.itens ?? []).length === 0 ? (
                      <p style={{ margin: 0, color: 'var(--ink-400)' }}>Nenhum item registrado.</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {(dadosOSQuery.data?.itens ?? []).map((it, i) => (
                          <li key={i}>
                            {it.nome} (x{it.quantidade})
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {tipoLaudo !== 'diagnostico' && (
              <div className="campo-form">
                <label>Resultado</label>
                <select value={form.resultado} onChange={(e) => setForm((f) => ({ ...f, resultado: e.target.value }))}>
                  <option value="Aprovado">Aprovado</option>
                  <option value="Reprovado">Reprovado</option>
                </select>
              </div>
            )}
            <div className="campo-form">
              <label>{tipoLaudo === 'nota' ? 'Observações técnicas' : 'Observações adicionais'}</label>
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
