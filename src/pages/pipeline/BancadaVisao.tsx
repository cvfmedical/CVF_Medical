import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { supabase } from '../../lib/supabaseClient';
import { gerarNumeroSequencial } from '../../lib/numeroSequencial';
import { mensagemErro } from '../../lib/erros';
import { useAuth } from '../../contexts/AuthContext';
import { iniciarOpenCvWorker, calcularMetricasWorker } from '../../lib/opencvWorkerClient';
import { statusMetricas, FATOR_CALIB_PADRAO, type MetricasOticas } from '../../lib/metrologiaOptica';
import { conformeFov, conformeDirecao, desvioFovPct } from '../../lib/iso8600';
import { lerLeituras, estatisticaRepetibilidade } from '../../lib/incerteza';
import { BancadaVisaoPdf, type DadosBancadaPdf } from './BancadaVisaoPdf';
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

interface CatalogoOticaSpec {
  id: number;
  fabricante: string;
  modelo: string;
  angulo_graus: number | null; // direção de visão nominal (ISO 8600-1 §4.6)
  fov_referencia_graus: number | null; // golden sample (ISO 8600-1 §4.5)
  tolerancia_fov_pct: number | null;
  tolerancia_direcao_graus: number | null;
  distancia_medicao_mm: number | null;
  metodo_iso: string | null;
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
  const cvProntoRef = useRef(false);
  const processandoRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  // Refs para valores lidos dentro do setInterval (evita closure
  // desatualizada - o interval é criado uma vez em iniciarInspecao).
  const fatorCalibRef = useRef(FATOR_CALIB_PADRAO);
  const gradeLigadaRef = useRef(true);

  // Calibração por 2 pontos (método exato, padrão de metrologia): o técnico
  // clica em duas marcas da régua com distância conhecida -> fator pixel->mm
  // exato. Fica salvo (localStorage) para reuso.
  const [modoCalib, setModoCalib] = useState(false);
  const [pontosCalib, setPontosCalib] = useState<{ x: number; y: number }[]>([]);
  const [fatorAtual, setFatorAtual] = useState(FATOR_CALIB_PADRAO);
  const frameCalibRef = useRef<HTMLCanvasElement | null>(null);
  const calibCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    gradeLigadaRef.current = gradeLigada;
  }, [gradeLigada]);

  // Carrega a última calibração salva ao abrir a tela.
  useEffect(() => {
    const salvo = localStorage.getItem('cvf_fator_calib');
    const n = salvo ? Number(salvo) : NaN;
    if (n > 0) {
      fatorCalibRef.current = n;
      setFatorAtual(n);
    }
  }, []);

  // Redesenha o frame congelado + os pontos marcados no modo de calibração.
  useEffect(() => {
    if (!modoCalib) return;
    const canvas = calibCanvasRef.current;
    const frame = frameCalibRef.current;
    if (!canvas || !frame) return;
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(frame, 0, 0);
    ctx.lineWidth = Math.max(2, frame.width / 500);
    ctx.strokeStyle = '#22c55e';
    ctx.fillStyle = '#22c55e';
    const r = Math.max(4, frame.width / 200);
    pontosCalib.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    if (pontosCalib.length === 2) {
      ctx.beginPath();
      ctx.moveTo(pontosCalib[0].x, pontosCalib[0].y);
      ctx.lineTo(pontosCalib[1].x, pontosCalib[1].y);
      ctx.stroke();
    }
  }, [modoCalib, pontosCalib]);

  // Conecta o stream da câmera ao <video> quando a tela de inspeção
  // renderiza (rodando=true). Feito aqui, e não em iniciarInspecao, porque
  // o elemento de vídeo ainda não existe no momento do getUserMedia.
  useEffect(() => {
    const v = videoRef.current;
    if (rodando && v && streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
    }
  }, [rodando]);

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

  const [cvErro, setCvErro] = useState<string | null>(null);
  const [cvCarregando, setCvCarregando] = useState(false);
  // Resultado definido pelo técnico (inspeção visual). A medição automática
  // por OpenCV é OPCIONAL e carregada só sob demanda - ela é pesada e trava
  // máquinas mais lentas, então NÃO carrega sozinha ao abrir a tela.
  const [resultadoManual, setResultadoManual] = useState<'Aprovado' | 'Reprovado'>('Aprovado');

  // --- Ensaio ISO 8600 (FOV + direção de visão) ---
  const [modeloId, setModeloId] = useState('');
  const [fovMedido, setFovMedido] = useState('');
  // Leituras repetidas de FOV (opcional) -> incerteza de medição (tipo A).
  const [fovLeituras, setFovLeituras] = useState('');
  const [distanciaMedicao, setDistanciaMedicao] = useState('50');
  const [direcaoMedida, setDirecaoMedida] = useState('');
  const [calibracaoId, setCalibracaoId] = useState('');

  const modelosQuery = useQuery({
    queryKey: ['catalogo-oticas-iso'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalogo_oticas')
        .select(
          'id, fabricante, modelo, angulo_graus, fov_referencia_graus, tolerancia_fov_pct, tolerancia_direcao_graus, distancia_medicao_mm, metodo_iso',
        )
        .order('fabricante');
      if (error) throw error;
      return data as CatalogoOticaSpec[];
    },
  });

  const calibsQuery = useQuery({
    queryKey: ['padroes-calibracao-validos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('padroes_calibracao')
        .select('id, identificacao, data_validade, status_ativo')
        .eq('status_ativo', true)
        .order('data_validade', { ascending: false });
      if (error) throw error;
      return data as { id: number; identificacao: string; data_validade: string | null }[];
    },
  });

  const spec = modelosQuery.data?.find((m) => String(m.id) === modeloId) ?? null;
  const hojeCalib = new Date();
  hojeCalib.setHours(0, 0, 0, 0);
  const calibsValidas = (calibsQuery.data ?? []).filter(
    (c) => !!c.data_validade && new Date(c.data_validade + 'T00:00:00') >= hojeCalib,
  );

  // Prévia do veredito ISO (mostra conforme/não conforme enquanto o técnico digita).
  const previewIso = (() => {
    if (!spec || spec.fov_referencia_graus == null || fovMedido === '') return null;
    const fovM = Number(fovMedido);
    const fovConf = conformeFov(fovM, spec.fov_referencia_graus, spec.tolerancia_fov_pct ?? 15);
    const dvM = direcaoMedida !== '' ? Number(direcaoMedida) : null;
    const dvConf =
      dvM != null && spec.angulo_graus != null
        ? conformeDirecao(dvM, spec.angulo_graus, spec.tolerancia_direcao_graus ?? 10)
        : null;
    return { fovConf, dvConf, desvio: desvioFovPct(fovM, spec.fov_referencia_graus) };
  })();

  function ativarMedicaoAutomatica() {
    if (cvPronto || cvCarregando) return;
    setCvErro(null);
    setCvCarregando(true);
    iniciarOpenCvWorker()
      .then(() => {
        cvProntoRef.current = true;
        setCvPronto(true);
      })
      .catch(() => setCvErro('Não foi possível carregar o motor de análise de imagem (OpenCV).'))
      .finally(() => setCvCarregando(false));
  }

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

  async function processarFrame() {
    // Análise no worker (thread de fundo). O guard evita empilhar frames
    // se o worker ainda estiver processando o anterior.
    if (!cvProntoRef.current || processandoRef.current) return;
    const imageData = capturarFrame();
    if (!imageData) return;
    processandoRef.current = true;
    try {
      const m = await calcularMetricasWorker(imageData, fatorCalibRef.current);
      setMetricas(m);
      desenharOverlay(m);
    } catch {
      // frame ocasionalmente inválido - ignora, tenta de novo no próximo tick
    } finally {
      processandoRef.current = false;
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
      // O elemento <video> só é renderizado depois de rodando=true; um
      // useEffect (abaixo) conecta o stream quando a tela de inspeção aparece.
      // Fazer aqui direto não funciona (videoRef ainda é null) -> tela preta.
      setRodando(true);
      intervalRef.current = window.setInterval(processarFrame, 250);
      // Carrega o OpenCV no worker (thread de fundo) - a análise ISO 8600
      // aparece sozinha quando ficar pronta, sem travar a tela.
      ativarMedicaoAutomatica();
    } catch {
      setCameraErro('Não foi possível acessar a câmera (verifique a permissão do navegador).');
    }
  }

  // Calibração por 2 pontos (exata): congela o frame atual para o técnico
  // clicar em duas marcas da régua com distância conhecida.
  function iniciarCalibracao() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      alert('Inicie a câmera e posicione a régua no campo antes de calibrar.');
      return;
    }
    const off = document.createElement('canvas');
    off.width = video.videoWidth;
    off.height = video.videoHeight;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    frameCalibRef.current = off;
    setPontosCalib([]);
    setModoCalib(true);
  }

  function cancelarCalibracao() {
    setModoCalib(false);
    setPontosCalib([]);
    frameCalibRef.current = null;
  }

  function cliqueCalibracao(e: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = calibCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // O canvas é exibido com escala uniforme (aspecto preservado), então o
    // mapeamento tela->pixel do frame é direto.
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const novos = [...pontosCalib, { x, y }];
    if (novos.length < 2) {
      setPontosCalib(novos);
      return;
    }
    const [a, b] = novos.slice(-2);
    const distPx = Math.hypot(a.x - b.x, a.y - b.y);
    setPontosCalib([a, b]);
    if (distPx < 5) {
      alert('Os dois pontos estão muito próximos. Clique em marcas mais distantes na régua.');
      setPontosCalib([]);
      return;
    }
    const mmStr = prompt(
      `Distância medida na imagem: ${distPx.toFixed(1)} pixels.\n\n` +
        'Qual a distância REAL entre os dois pontos, em mm? (leia na régua)\n' +
        'Dica: quanto maior a distância usada, mais precisa a calibração.',
    );
    const mm = mmStr ? Number(mmStr.replace(',', '.')) : null;
    if (!mm || mm <= 0) {
      setPontosCalib([]);
      return;
    }
    const fator = mm / distPx;
    fatorCalibRef.current = fator;
    setFatorAtual(fator);
    localStorage.setItem('cvf_fator_calib', String(fator));
    setModoCalib(false);
    setPontosCalib([]);
    frameCalibRef.current = null;
    alert(
      `Calibração salva com precisão.\n${mm} mm = ${distPx.toFixed(1)} px\n1 pixel = ${fator.toFixed(5)} mm\n\n` +
        'O valor fica salvo e será reutilizado nas próximas inspeções.',
    );
  }

  // Analisa uma imagem de arquivo (sem câmera) com o mesmo motor ISO 8600
  // do worker e gera o laudo. Útil para bancadas sem câmera no navegador ou
  // para reprocessar uma foto capturada do endoscópio.
  async function analisarImagemArquivo(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !osSelecionada) return;
    setErro(null);
    setGerando(true);
    try {
      await iniciarOpenCvWorker();
      cvProntoRef.current = true;
      setCvPronto(true);
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível.');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const metricasFinal = await calcularMetricasWorker(imageData, fatorCalibRef.current);
      const imagemDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      await gerarLaudo({ metricas: metricasFinal, imagemDataUrl });
    } catch (e) {
      setErro(mensagemErro(e));
      setGerando(false);
    }
  }

  async function gerarLaudo(override?: { metricas: MetricasOticas | null; imagemDataUrl: string | null }) {
    if (!osSelecionada) return;
    setErro(null);
    // Repetibilidade: se o técnico informou N leituras de FOV, a média é o
    // valor reportado e o desvio vira a incerteza (tipo A, k=2).
    const estFov = estatisticaRepetibilidade(lerLeituras(fovLeituras));
    const fovInformado = fovMedido !== '' || estFov != null;
    // Porteiras ISO 8600: só bloqueiam quando o técnico ESCOLHEU um modelo
    // (intenção de emitir laudo conforme). Sem modelo, os fluxos antigos
    // (OpenCV / manual) seguem inalterados.
    if (modeloId && spec && spec.fov_referencia_graus == null) {
      setErro('Modelo sem golden sample (FOV de referência). Cadastre em "Amostras-padrão" antes de emitir o laudo.');
      return;
    }
    if (modeloId && fovInformado && calibsValidas.length === 0) {
      setErro('Nenhum padrão de calibração válido (ativo e na validade). Atualize em "Calibração de padrões" antes do laudo.');
      return;
    }
    if (modeloId && fovInformado && !calibracaoId) {
      setErro('Selecione o padrão de calibração (alvo) usado no ensaio.');
      return;
    }
    if (modeloId && spec?.angulo_graus != null && fovInformado && direcaoMedida === '') {
      setErro('Informe a direção de visão medida — este modelo tem direção nominal (ISO 8600-1 §4.6).');
      return;
    }
    setGerando(true);
    try {
      let metricasFinal: MetricasOticas | null;
      let imagemDataUrl: string | null;
      if (override) {
        // Análise a partir de uma imagem de arquivo (já processada no worker).
        metricasFinal = override.metricas;
        imagemDataUrl = override.imagemDataUrl;
      } else {
        // Fluxo da câmera: captura o frame e mede no worker (se ativo).
        const imageData = capturarFrame();
        metricasFinal =
          cvProntoRef.current && imageData ? await calcularMetricasWorker(imageData, fatorCalibRef.current) : null;
        imagemDataUrl = capturaRef.current?.toDataURL('image/jpeg', 0.85) ?? null;
      }
      // Veredito ISO 8600 (prioritário): modelo com golden sample + FOV medido
      // -> aplica ±15% (FOV, §4.5) e ±10° (direção, §4.6). Senão, cai no OpenCV
      // (complementar) ou no resultado manual.
      const usarIso = !!spec && spec.fov_referencia_graus != null && fovInformado;
      let isoCampos: Record<string, unknown> = {};
      let isoProp: DadosBancadaPdf['iso'] = undefined;
      let resultado: 'Aprovado' | 'Reprovado';
      if (usarIso && spec) {
        const fovM = estFov ? estFov.media : Number(fovMedido);
        const fovIncerteza = estFov ? Number(estFov.incertezaExpandida.toFixed(3)) : null;
        const dvM = direcaoMedida !== '' ? Number(direcaoMedida) : null;
        const fovRef = spec.fov_referencia_graus as number;
        const fovConf = conformeFov(fovM, fovRef, spec.tolerancia_fov_pct ?? 15);
        const dvConf =
          dvM != null && spec.angulo_graus != null
            ? conformeDirecao(dvM, spec.angulo_graus, spec.tolerancia_direcao_graus ?? 10)
            : true;
        resultado = fovConf && dvConf ? 'Aprovado' : 'Reprovado';
        isoCampos = {
          catalogo_otica_id: Number(modeloId),
          numero_serie_otica: osSelecionada.optica_sn ?? null,
          metodo_iso: spec.metodo_iso ?? 'A',
          distancia_medicao_mm: distanciaMedicao !== '' ? Number(distanciaMedicao) : null,
          fov_medido_graus: fovM,
          fov_referencia_graus: fovRef,
          fov_desvio_pct: Number(desvioFovPct(fovM, fovRef).toFixed(2)),
          fov_conforme: fovConf,
          fov_incerteza_graus: fovIncerteza,
          direcao_medida_graus: dvM,
          direcao_nominal_graus: spec.angulo_graus,
          direcao_conforme: dvConf,
          calibracao_id: calibracaoId ? Number(calibracaoId) : null,
        };
        isoProp = {
          modeloNome: `${spec.fabricante} ${spec.modelo}`,
          metodo: spec.metodo_iso ?? 'A',
          distanciaMm: distanciaMedicao !== '' ? Number(distanciaMedicao) : null,
          fovMedido: fovM,
          fovReferencia: fovRef,
          fovDesvioPct: Number(desvioFovPct(fovM, fovRef).toFixed(2)),
          fovTolPct: spec.tolerancia_fov_pct ?? 15,
          fovConforme: fovConf,
          fovIncerteza,
          direcaoMedida: dvM,
          direcaoNominal: spec.angulo_graus,
          direcaoTolGraus: spec.tolerancia_direcao_graus ?? 10,
          direcaoConforme: dvM != null && spec.angulo_graus != null ? dvConf : null,
          calibracao: calibsQuery.data?.find((c) => String(c.id) === calibracaoId)?.identificacao ?? null,
        };
      } else {
        resultado = metricasFinal
          ? statusMetricas(metricasFinal).conforme
            ? 'Aprovado'
            : 'Reprovado'
          : resultadoManual;
      }

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
            resultado,
            imagemDataUrl,
            tecnicoResponsavel: funcionario?.nome ?? '',
            observacoes,
            iso: isoProp,
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
        ...isoCampos,
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

        <div
          style={{
            maxWidth: 420,
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: 12,
            margin: '12px 0',
          }}
        >
          <strong style={{ fontSize: 13 }}>Ensaio ISO 8600 (FOV + direção de visão)</strong>
          <div className="campo-form">
            <label>Modelo da ótica</label>
            <select value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
              <option value="">Selecione o modelo...</option>
              {(modelosQuery.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fabricante} {m.modelo}
                </option>
              ))}
            </select>
          </div>
          {spec && spec.fov_referencia_graus == null && (
            <p className="erro-login">
              Modelo sem golden sample. Cadastre o FOV de referência em "Amostras-padrão" antes do laudo.
            </p>
          )}
          {spec && spec.fov_referencia_graus != null && (
            <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>
              FOV ref.: {spec.fov_referencia_graus}° (±{spec.tolerancia_fov_pct ?? 15}%) • Direção nominal:{' '}
              {spec.angulo_graus ?? '—'}° (±{spec.tolerancia_direcao_graus ?? 10}°)
            </p>
          )}
          <div className="campo-form">
            <label>Padrão de calibração (alvo)</label>
            <select value={calibracaoId} onChange={(e) => setCalibracaoId(e.target.value)}>
              <option value="">Selecione...</option>
              {calibsValidas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.identificacao}
                </option>
              ))}
            </select>
            {calibsQuery.data && calibsValidas.length === 0 && (
              <p className="erro-login">
                Nenhum padrão de calibração válido. Cadastre/renove em "Calibração de padrões".
              </p>
            )}
          </div>
          <div className="campo-form">
            <label>FOV medido (°) — leia o anel que a borda do campo alcança</label>
            <input type="number" value={fovMedido} onChange={(e) => setFovMedido(e.target.value)} />
          </div>
          <div className="campo-form">
            <label>Leituras repetidas de FOV (opcional, p/ incerteza) — ex.: 89,5 90 90,5</label>
            <input
              type="text"
              value={fovLeituras}
              onChange={(e) => setFovLeituras(e.target.value)}
              placeholder="informe 2+ leituras separadas por espaço/vírgula → usa a média ± incerteza (k=2)"
            />
          </div>
          <div className="campo-form">
            <label>Distância de medição (mm)</label>
            <input type="number" value={distanciaMedicao} onChange={(e) => setDistanciaMedicao(e.target.value)} />
          </div>
          <div className="campo-form">
            <label>Direção de visão medida (°) — inclinômetro</label>
            <input type="number" value={direcaoMedida} onChange={(e) => setDirecaoMedida(e.target.value)} />
          </div>
          {previewIso && (
            <p
              style={{
                fontWeight: 600,
                color: previewIso.fovConf && previewIso.dvConf !== false ? '#16a34a' : '#dc2626',
              }}
            >
              FOV desvio {previewIso.desvio.toFixed(1)}% → {previewIso.fovConf ? 'conforme' : 'NÃO conforme'}
              {previewIso.dvConf !== null && ` • Direção → ${previewIso.dvConf ? 'conforme' : 'NÃO conforme'}`}
            </p>
          )}
        </div>

        <div className="campo-form" style={{ maxWidth: 420 }}>
          <label>Resultado da inspeção (usado só sem medição ISO)</label>
          <select
            value={resultadoManual}
            onChange={(e) => setResultadoManual(e.target.value as 'Aprovado' | 'Reprovado')}
          >
            <option value="Aprovado">Aprovado</option>
            <option value="Reprovado">Reprovado</option>
          </select>
        </div>
        {etapa === 'checkpoint_a' && (
          <div className="campo-form" style={{ maxWidth: 420 }}>
            <label>Este equipamento precisa de selagem?</label>
            <select
              value={precisaSelagem ? 'sim' : 'nao'}
              onChange={(e) => setPrecisaSelagem(e.target.value === 'sim')}
            >
              <option value="sim">Sim (ótica selável - vai para Selagem)</option>
              <option value="nao">Não (ex: bomba de infusão - vai para Teste de Qualidade)</option>
            </select>
          </div>
        )}
        <div className="campo-form" style={{ maxWidth: 420 }}>
          <label>Observações</label>
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>

        {cameraErro && <p className="erro-login">{cameraErro}</p>}
        {cvErro && <p className="erro-login">{cvErro}</p>}
        {erro && <p className="erro-login">{erro}</p>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 460 }}>
          <button className="botao-primario botao-pequeno" onClick={iniciarInspecao} disabled={!osId}>
            Iniciar inspeção (medição automática ISO 8600)
          </button>
          <button className="botao-secundario botao-pequeno" onClick={() => gerarLaudo()} disabled={gerando || !osId}>
            {gerando ? 'Gerando...' : 'Registrar sem câmera (manual)'}
          </button>
        </div>
        <label
          className="botao-secundario botao-pequeno"
          style={{ display: 'inline-block', cursor: osId && !gerando ? 'pointer' : 'not-allowed', maxWidth: 460, marginTop: 8, opacity: osId && !gerando ? 1 : 0.6 }}
        >
          {gerando ? 'Analisando imagem...' : 'Analisar imagem ISO 8600 (arquivo, sem câmera)'}
          <input
            type="file"
            accept="image/*"
            onChange={analisarImagemArquivo}
            disabled={gerando || !osId}
            style={{ display: 'none' }}
          />
        </label>
        <p style={{ fontSize: 12, color: 'var(--ink-400)', maxWidth: 460, marginTop: 4 }}>
          "Iniciar inspeção" abre a câmera e faz a medição automática ISO 8600 em segundo plano (não trava a tela).
          "Analisar imagem" roda a mesma medição sobre uma foto (útil para testar ou sem câmera).
          "Registrar sem câmera" gera um laudo só com o resultado que você marcar, sem câmera nem medição.
        </p>
      </div>
    );
  }

  const st = metricas ? statusMetricas(metricas) : null;

  return (
    <div style={{ background: '#000', margin: -24, minHeight: 'calc(100vh - 48px)', display: 'flex', position: 'relative' }}>
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
        <div className="campo-form">
          <label style={{ color: '#fff' }}>Resultado da inspeção</label>
          <select
            value={resultadoManual}
            onChange={(e) => setResultadoManual(e.target.value as 'Aprovado' | 'Reprovado')}
            disabled={!!metricas}
          >
            <option value="Aprovado">Aprovado</option>
            <option value="Reprovado">Reprovado</option>
          </select>
          {metricas && (
            <p style={{ color: '#94a3b8', fontSize: 11 }}>Definido pela medição automática (OpenCV).</p>
          )}
        </div>
        {!cvPronto && (
          <button className="botao-secundario" onClick={ativarMedicaoAutomatica} disabled={cvCarregando}>
            {cvCarregando ? 'Carregando OpenCV (~10-20s)...' : 'Ativar medição automática (opcional)'}
          </button>
        )}
        {cvErro && <p className="erro-login">{cvErro}</p>}
        <button className="botao-secundario" onClick={fechar}>
          Fechar
        </button>
        <button className="botao-primario" onClick={() => gerarLaudo()} disabled={gerando}>
          {gerando ? 'Gerando...' : 'Gerar laudo'}
        </button>
        <button className="botao-secundario" onClick={iniciarCalibracao}>
          Calibrar (régua, 2 pontos)
        </button>
        <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>
          Fator: 1 px = {fatorAtual.toFixed(5)} mm
          {fatorAtual === FATOR_CALIB_PADRAO ? ' — padrão, calibre com a régua!' : ' (calibrado/salvo)'}
        </p>
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
        {spec && spec.fov_referencia_graus != null && (
          <div style={{ borderTop: '1px solid #334155', paddingTop: 8 }}>
            <p style={{ color: '#fff', fontSize: 12, margin: '0 0 6px' }}>
              ISO 8600 — {spec.fabricante} {spec.modelo} (FOV ref. {spec.fov_referencia_graus}°)
            </p>
            <div className="campo-form">
              <label style={{ color: '#fff' }}>FOV medido (°)</label>
              <input type="number" value={fovMedido} onChange={(e) => setFovMedido(e.target.value)} />
            </div>
            <div className="campo-form">
              <label style={{ color: '#fff' }}>Distância (mm)</label>
              <input type="number" value={distanciaMedicao} onChange={(e) => setDistanciaMedicao(e.target.value)} />
            </div>
            <div className="campo-form">
              <label style={{ color: '#fff' }}>Direção de visão (°)</label>
              <input type="number" value={direcaoMedida} onChange={(e) => setDirecaoMedida(e.target.value)} />
            </div>
            {previewIso && (
              <p
                style={{
                  fontWeight: 600,
                  fontSize: 12,
                  color: previewIso.fovConf && previewIso.dvConf !== false ? '#4ade80' : '#f87171',
                }}
              >
                FOV {previewIso.desvio.toFixed(1)}% {previewIso.fovConf ? '✓' : '✗'}
                {previewIso.dvConf !== null && ` • Dir ${previewIso.dvConf ? '✓' : '✗'}`}
              </p>
            )}
          </div>
        )}
        {st && (
          <p style={{ color: st.conforme ? '#4ade80' : '#f87171', fontWeight: 600 }}>
            {st.conforme ? 'CONFORME' : 'NÃO CONFORME'}
          </p>
        )}
        {erro && <p className="erro-login">{erro}</p>}
      </div>

      {modoCalib && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.96)',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: 10,
              color: '#fff',
              background: '#0f172a',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <strong>Calibração por 2 pontos.</strong>
            <span>
              Clique em <strong>duas marcas da régua</strong> com distância conhecida (quanto mais longe, mais preciso).
              Marcados: {pontosCalib.length}/2
            </span>
            <button className="botao-secundario botao-pequeno" onClick={cancelarCalibracao}>
              Cancelar
            </button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 8 }}>
            <canvas
              ref={calibCanvasRef}
              onClick={cliqueCalibracao}
              style={{ maxWidth: '100%', maxHeight: '100%', cursor: 'crosshair' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
