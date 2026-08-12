import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { useAuth } from '../../contexts/AuthContext';
import { useOrdensServicoOpcoes } from '../../lib/useOrdensServicoOpcoes';
import { CarregandoTela } from '../../components/CarregandoTela';
import { Badge } from '../../components/Badge';
import { LaudoPdf } from './LaudoPdf';

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
            <th>Nº laudo</th>
            <th>OS</th>
            <th>Técnico</th>
            <th>Resultado</th>
            <th>Emitido em</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(laudosQuery.data ?? []).map((l) => (
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
          {(laudosQuery.data ?? []).length === 0 && (
            <tr>
              <td colSpan={6}>Nenhum laudo emitido ainda.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalAberto && (
        <div className="modal-fundo">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Nova nota técnica interna</h2>

            <div className="campo-form">
              <label>Ordem de serviço *</label>
              <select
                value={form.ordem_servico_id}
                onChange={(e) => setForm((f) => ({ ...f, ordem_servico_id: e.target.value }))}
              >
                <option value="">Selecione...</option>
                {opcoesOS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
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
          </div>
        </div>
      )}
    </div>
  );
}
