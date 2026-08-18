import { useState } from 'react';
import { normalizarBusca } from '../../lib/normalizarBusca';
import { ThOrdenavel } from '../../components/ThOrdenavel';
import { useLinhasOrdenadas } from '../../lib/useOrdenacao';
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
import { ComboboxBusca } from '../../components/ComboboxBusca';

interface Laudo {
  id: number;
  numero_laudo: string;
  ordem_servico_id: number;
  tecnico_responsavel: string | null;
  resultado: string;
  storage_path: string | null;
  data_emissao: string;
}

async function gerarNumeroLaudo(): Promise<string> {
  return gerarNumeroSequencial('LAUDO', 'laudos', 'numero_laudo');
}

export function Laudos() {
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const { opcoes: opcoesOS, porId } = useOrdensServicoOpcoes();
  const [modalAberto, setModalAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({ ordem_servico_id: '', resultado: 'Aprovado', observacoes_tecnicas: '' });
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, string>>({});

  const { minimizar: minimizarRascunho } = useRascunhoDeTela('laudos', {
    titulo: 'Nova nota técnica interna',
    obterEstado: () => ({ form }),
    aoRestaurar: (e) => {
      setForm((e.form as typeof form) ?? { ordem_servico_id: '', resultado: 'Aprovado', observacoes_tecnicas: '' });
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
        .select('id, numero_laudo, ordem_servico_id, tecnico_responsavel, resultado, storage_path, data_emissao')
        .order('data_emissao', { ascending: false });
      if (error) throw error;
      return data as Laudo[];
    },
  });

  function valorColuna(l: Laudo, chave: string): unknown {
    if (chave === 'numero_os') return porId(l.ordem_servico_id)?.numero_os ?? `#${l.ordem_servico_id}`;
    if (chave === 'data_emissao') return l.data_emissao;
    return (l as unknown as Record<string, unknown>)[chave];
  }

  const linhasFiltradas = (laudosQuery.data ?? []).filter((l) => {
    const ativos = Object.entries(filtrosColuna).filter(([, v]) => v.trim());
    return ativos.every(([chave, termo]) =>
      normalizarBusca(String(valorColuna(l, chave) ?? '')).includes(normalizarBusca(termo.trim())),
    );
  });
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
      const blob = await pdf(
        <LaudoPdf
          dados={{
            numeroLaudo,
            numeroOS: os?.numero_os ?? '',
            clienteNome: os?.cliente_nome ?? '',
            equipamentoDesc: '',
            tecnicoResponsavel: funcionario?.nome ?? '',
            resultado: form.resultado,
            observacoesTecnicas: form.observacoes_tecnicas,
            dataEmissao: new Date().toLocaleDateString('pt-BR'),
          }}
        />,
      ).toBlob();

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
      });
      if (erroInsert) throw erroInsert;

      setModalAberto(false);
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
        <button className="botao-primario botao-pequeno" onClick={() => setModalAberto(true)}>
          Nova nota interna
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-400)', margin: '0 0 12px', maxWidth: 760 }}>
        Os <strong>laudos de conformidade ISO 8600</strong> (com medições e critérios) são gerados na
        <strong> Bancada de Visão</strong> e no <strong>Teste de resolução</strong>. Este botão cria apenas uma
        <strong> nota interna simplificada</strong> (sem medições) e todos os documentos aparecem na lista abaixo.
      </p>

      <table className="tabela-crud">
        <thead>
          <tr>
            {[
              ['numero_laudo', 'Nº laudo'],
              ['numero_os', 'OS'],
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
            {['numero_laudo', 'numero_os', 'tecnico_responsavel', 'resultado', 'data_emissao'].map((chave) => (
              <th key={chave} style={{ padding: '2px 6px' }}>
                <input
                  type="text"
                  className="campo-filtro-coluna"
                  placeholder="Filtrar..."
                  value={filtrosColuna[chave] ?? ''}
                  onChange={(e) => setFiltrosColuna((f) => ({ ...f, [chave]: e.target.value }))}
                />
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              <td className="mono">{l.numero_laudo}</td>
              <td className="mono">{porId(l.ordem_servico_id)?.numero_os ?? `#${l.ordem_servico_id}`}</td>
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
              <td colSpan={6}>Nenhum laudo encontrado.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <ModalJanela
          titulo="Nova nota técnica interna"
          aoFechar={() => setModalAberto(false)}
          aoMinimizar={minimizarLaudo}
        >
            <div className="campo-form">
              <label>Ordem de serviço *</label>
              <ComboboxBusca
                opcoes={opcoesOS}
                valor={String(form.ordem_servico_id ?? '')}
                onChange={(valor) => setForm((f) => ({ ...f, ordem_servico_id: valor }))}
              />
            </div>
            <div className="campo-form">
              <label>Resultado</label>
              <select value={form.resultado} onChange={(e) => setForm((f) => ({ ...f, resultado: e.target.value }))}>
                <option value="Aprovado">Aprovado</option>
                <option value="Reprovado">Reprovado</option>
              </select>
            </div>
            <div className="campo-form">
              <label>Observações técnicas</label>
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
                {gerando ? 'Gerando...' : 'Gerar nota interna'}
              </button>
            </div>
        </ModalJanela>
      )}
    </div>
  );
}
