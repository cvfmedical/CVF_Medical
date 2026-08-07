import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { useAuth } from '../../contexts/AuthContext';
import { carregarOpenCv } from '../../lib/opencvLoader';
import {
  calcularMetricas,
  detectarDiametroAlvo,
  statusMetricas,
  FATOR_CALIB_PADRAO,
  type MetricasOticas,
} from '../../lib/metrologiaOptica';
import { BancadaVisaoPdf } from './BancadaVisaoPdf';
import {
  STATUS_CHECKPOINT_A,
  STATUS_CHECKPOINT_B,
  STATUS_SELAGEM,
  STATUS_PRONTO_ENTREGA,
  STATUS_VOLTA_MANUTENCAO,
  STATUS_TESTE_QUALIDADE,
} from '../../lib/statusOS';

// Porte de bancada_visao.py + gerador_pdf.py para o navegador - câmera
// via getUserMedia (multiplataforma, ao contrário do DirectShow do
// desktop) e a mesma matemática de metrologia via OpenCV.js.

type Etapa = 'checkpoint_a' | 'checkpoint_b';

interface OSResumo {
  id: number;
  numero_os: string;
  cliente_id: number;
  cliente_nome: string;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
}

async function gerarNumeroLaudo(): Promise<string> {
  return gerarNumeroSequencial('LAUDO', 'laudos', 'numero_laudo');
}

export function BancadaVisao() {
  const { funcionario } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [etapa, setEtapa] = useState<Etapa>('checkpoint_a');
  const [osId, setOsId] = useState('');
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cvPronto, setCvPronto] = useState(false);
  const [cameraErro, setCameraErro] = useState<string | null>(null);
  const [metricas, setMetricas] = useState<MetricasOticas | null>(null);
  const [gradeLigada, setGradeLigada] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [precisaSelagem, setPrecisaSelagem] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const capturaRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cvRef = useRef<Awaited<ReturnType<typeof carregarOpenCv>> | null>(null);
  const intervalRef = useRef<number | null>(null);
  // Refs para valores lidos dentro do setInterval (evita closure
  // desatualizada - o interval é criado uma vez em iniciarInspecao).
  const fatorCalibRef = useRef(FATOR_CALIB_PADRAO);
  const gradeLigadaRef = useRef(true);

  useEffect(() => {
    gradeLigadaRef.current = gradeLigada;
  }, [gradeLigada]);

  const statusAlvo = etapa === 'checkpoint_a' ? STATUS_CHECKPOINT_A : STATUS_CHECKPOINT_B;

  const osQuery = useQuery({
    queryKey: ['os-bancada-visao', etapa],
    queryFn: async (): Promise<OSResumo[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero_os, cliente_id, cliente_nome, optica_desc, optica_fab, optica_sn')
        .eq('status_os', statusAlvo)
        .order('data_abertura', { ascending: false });
      if (error) throw error;
      return data as OSResumo[];
    },
  });

  const osSelecionada = osQuery.data?.find((o) => String(o.id) === osId) ?? null;

  const clienteQuery = useQuery({
    queryKey: ['cliente-bancada-visao', osSelecionada?.cliente_id],
    enabled: !!osSelecionada,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, cnpj, nome_fantasia, cidade, email')
        .eq('id', osSelecionada!.cliente_id)
        .single();
      if (error) throw error;
      return data as { id: number; cnpj: string | null; nome_fantasia: string | null; cidade: string | null; email: string | null };
    },
  });

  useEffect(() => {
    carregarOpenCv().then((cv) => {
      cvRef.current = cv;
      setCvPronto(true);
    });
  }, []);

  useEffect(() => {
    return () => {
      pararCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pararCamera() {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function capturarFrame(): ImageData | null {
    const video = videoRef.current;
    const canvas = capturaRef.current;
    if (!video || !canvas || !video.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function desenharOverlay(m: MetricasOticas) {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || !video.videoWidth) return;
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const w = overlay.width;
    const h = overlay.height;
    const cx = w / 2;
    const cy = h / 2;

    if (gradeLigadaRef.current) {
      ctx.strokeStyle = 'rgba(150,150,150,0.8)';
      ctx.lineWidth = 1;
      [80, 160, 240].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(cx - 280, cy);
      ctx.lineTo(cx + 280, cy);
      ctx.moveTo(cx, cy - 280);
      ctx.lineTo(cx, cy + 280);
      ctx.stroke();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy);
      ctx.lineTo(cx + 10, cy);
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx, cy + 10);
      ctx.stroke();
    }

    const st = statusMetricas(m);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(10, 10, 300, 170);
    ctx.font = '13px monospace';
    let y = 30;
    const linha = (texto: string, cor: string) => {
      ctx.fillStyle = cor;
      ctx.fillText(texto, 18, y);
      y += 20;
    };
    linha(`Nitidez: ${m.nitidez.toFixed(1)} pts`, st.stNitidez ? '#4ade80' : '#f87171');
    linha(`Luz: ${m.luz.toFixed(1)}`, st.stLuz ? '#4ade80' : '#f87171');
    linha(`FOV: ${m.fov.toFixed(2)}°`, st.stFov ? '#4ade80' : '#f87171');
    linha(`Alinhamento: ${m.desvio.toFixed(2)}mm`, st.stDesvio ? '#4ade80' : '#f87171');
    linha(`Vinhetagem: ${m.vinheta.toFixed(1)}%`, st.stVinheta ? '#4ade80' : '#f87171');
    linha(`Desvio cor: ${m.cor.toFixed(1)}%`, st.stCor ? '#4ade80' : '#f87171');
    linha(`Distorção: ${m.distorcao.toFixed(1)}%`, st.stDistorcao ? '#4ade80' : '#f87171');
  }

  function processarFrame() {
    const cv = cvRef.current;
    if (!cv) return;
    const imageData = capturarFrame();
    if (!imageData) return;
    try {
      const m = calcularMetricas(cv, imageData, fatorCalibRef.current);
      setMetricas(m);
      desenharOverlay(m);
    } catch {
      // frame ocasionalmente inválido (ex: durante troca de resolução) - ignora, tenta de novo no próximo tick
    }
  }

  async function iniciarInspecao() {
    if (!osId) {
      setErro('Selecione a ordem de serviço.');
      return;
    }
    setErro(null);
    setCameraErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRodando(true);
      intervalRef.current = window.setInterval(processarFrame, 250);
    } catch {
      setCameraErro('Não foi possível acessar a câmera (verifique a permissão do navegador).');
    }
  }

  function calibrar() {
    const cv = cvRef.current;
    if (!cv) return;
    const imageData = capturarFrame();
    if (!imageData) {
      alert('Nenhuma imagem capturada para calibrar.');
      return;
    }
    const diametroPx = detectarDiametroAlvo(cv, imageData);
    if (!diametroPx || diametroPx < 50) {
      alert('Alvo óptico não detectado ou muito pequeno. Aproxime a ótica do alvo.');
      return;
    }
    const real = prompt(
      `Alvo detectado com ${diametroPx.toFixed(1)} pixels de diâmetro.\n\nQual é o diâmetro REAL deste alvo em milímetros (mm)?`,
    );
    const valor = real ? Number(real.replace(',', '.')) : null;
    if (valor && valor > 0) {
      fatorCalibRef.current = valor / diametroPx;
      alert(`Novo fator definido:\n1 pixel = ${(valor / diametroPx).toFixed(5)} mm`);
    }
  }

  async function gerarLaudo() {
    const cv = cvRef.current;
    if (!cv || !osSelecionada) return;
    setErro(null);
    setGerando(true);
    try {
      const imageData = capturarFrame();
      if (!imageData) throw new Error('Nenhuma imagem capturada da bancada.');
      const metricasFinal = calcularMetricas(cv, imageData, fatorCalibRef.current);
      const st = statusMetricas(metricasFinal);
      const resultado = st.conforme ? 'Aprovado' : 'Reprovado';

      const imagemDataUrl = capturaRef.current?.toDataURL('image/jpeg', 0.85) ?? null;

      const numeroLaudo = await gerarNumeroLaudo();
      const blob = await pdf(
        <BancadaVisaoPdf
          dados={{
            codLaudo: numeroLaudo,
            numeroOS: osSelecionada.numero_os,
            dataEmissao: new Date().toLocaleDateString('pt-BR'),
            dataEnsaio: new Date().toLocaleString('pt-BR'),
            etapa,
            clienteNome: osSelecionada.cliente_nome,
            clienteCnpj: clienteQuery.data?.cnpj ?? '',
            clienteFantasia: clienteQuery.data?.nome_fantasia ?? '',
            clienteCidade: clienteQuery.data?.cidade ?? '',
            clienteEmail: clienteQuery.data?.email ?? '',
            equipamentoDesc: osSelecionada.optica_desc ?? '',
            equipamentoFab: osSelecionada.optica_fab ?? '',
            equipamentoSn: osSelecionada.optica_sn ?? '',
            metricas: metricasFinal,
            imagemDataUrl,
            tecnicoResponsavel: funcionario?.nome ?? '',
            observacoes,
          }}
        />,
      ).toBlob();

      const caminho = `laudo_${osSelecionada.id}/${numeroLaudo}.pdf`;
      const { error: erroUpload } = await supabase.storage.from('laudos-pdf').upload(caminho, blob, {
        contentType: 'application/pdf',
      });
      if (erroUpload) throw erroUpload;

      const { error: erroInsert } = await supabase.from('laudos').insert({
        numero_laudo: numeroLaudo,
        ordem_servico_id: osSelecionada.id,
        tecnico_responsavel: funcionario?.nome ?? null,
        resultado,
        observacoes_tecnicas: observacoes || null,
        storage_path: caminho,
        etapa,
      });
      if (erroInsert) throw erroInsert;

      const novoStatus =
        resultado === 'Reprovado'
          ? STATUS_VOLTA_MANUTENCAO
          : etapa === 'checkpoint_a'
            ? (precisaSelagem ? STATUS_SELAGEM : STATUS_TESTE_QUALIDADE)
            : STATUS_PRONTO_ENTREGA;
      await supabase.from('ordens_servico').update({ status_os: novoStatus }).eq('id', osSelecionada.id);

      pararCamera();
      setPrecisaSelagem(true);
      qc.invalidateQueries({ queryKey: ['os-bancada-visao'] });
      alert(`Laudo ${numeroLaudo} gerado com sucesso - resultado: ${resultado}.`);
      navigate('/ordens-servico');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setGerando(false);
    }
  }

  function fechar() {
    pararCamera();
    setRodando(false);
    setMetricas(null);
    setPrecisaSelagem(true);
  }

  if (!rodando) {
    return (
      <div>
        <h1>Bancada de visão (ISO 8600)</h1>
        <div className="campo-form" style={{ maxWidth: 420 }}>
          <label>Etapa</label>
          <select
            value={etapa}
            onChange={(e) => {
              setEtapa(e.target.value as Etapa);
              setOsId('');
            }}
          >
            <option value="checkpoint_a">Checkpoint A (pré-selagem)</option>
            <option value="checkpoint_b">Checkpoint B (pós-autoclave, final)</option>
          </select>
        </div>
        <div className="campo-form" style={{ maxWidth: 420 }}>
          <label>Ordem de serviço</label>
          <select value={osId} onChange={(e) => setOsId(e.target.value)}>
            <option value="">Selecione...</option>
            {(osQuery.data ?? []).map((os) => (
              <option key={os.id} value={os.id}>
                {os.numero_os} - {os.cliente_nome}
              </option>
            ))}
          </select>
          {osQuery.data?.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 4 }}>
              Nenhuma OS está aguardando esta etapa no momento.
            </p>
          )}
        </div>

        {!cvPronto && (
          <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>Carregando motor de análise de imagem (OpenCV)...</p>
        )}
        {cameraErro && <p className="erro-login">{cameraErro}</p>}
        {erro && <p className="erro-login">{erro}</p>}

        <button className="botao-primario botao-pequeno" onClick={iniciarInspecao} disabled={!cvPronto || !osId}>
          Iniciar inspeção
        </button>
      </div>
    );
  }

  const st = metricas ? statusMetricas(metricas) : null;

  return (
    <div style={{ background: '#000', margin: -24, minHeight: 'calc(100vh - 48px)', display: 'flex' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />
      </div>
      <canvas ref={capturaRef} style={{ display: 'none' }} />

      <div style={{ width: 260, background: '#0f172a', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ color: '#fff', fontSize: 13 }}>
          {osSelecionada?.numero_os} - {osSelecionada?.cliente_nome}
        </p>
        <button className="botao-secundario" onClick={fechar}>
          Fechar
        </button>
        <button className="botao-primario" onClick={gerarLaudo} disabled={gerando || !metricas}>
          {gerando ? 'Gerando...' : 'Gerar laudo'}
        </button>
        <button className="botao-secundario" onClick={calibrar}>
          Calibrar
        </button>
        <button className="botao-secundario" onClick={() => setGradeLigada((g) => !g)}>
          Grade: {gradeLigada ? 'Ligada' : 'Desligada'}
        </button>
        {etapa === 'checkpoint_a' && (
          <div className="campo-form">
            <label style={{ color: '#fff' }}>Este equipamento precisa de selagem?</label>
            <select
              value={precisaSelagem ? 'sim' : 'nao'}
              onChange={(e) => setPrecisaSelagem(e.target.value === 'sim')}
            >
              <option value="sim">Sim (ótica selável - vai para Selagem)</option>
              <option value="nao">Não (ex: bomba de infusão - vai para Teste de Qualidade)</option>
            </select>
          </div>
        )}
        <div className="campo-form">
          <label style={{ color: '#fff' }}>Observações</label>
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
        {st && (
          <p style={{ color: st.conforme ? '#4ade80' : '#f87171', fontWeight: 600 }}>
            {st.conforme ? 'CONFORME' : 'NÃO CONFORME'}
          </p>
        )}
        {erro && <p className="erro-login">{erro}</p>}
      </div>
    </div>
  );
}
