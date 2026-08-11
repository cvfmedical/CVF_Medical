import { useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { calcularMtfSlantedEdge, paraCiclosPorMm, type ResultadoMtf, type Roi } from '../../lib/esfr';

// Teste de resolução óptica (ISO 8600-5, método e-SFR / borda inclinada).
// Fluxo: carrega a imagem capturada pela câmera monocromática (via software
// da câmera), o técnico marca uma ROI sobre uma borda inclinada (~2-10°), e o
// sistema calcula a MTF (ESF->LSF->FFT->MTF) + MTF50 + ângulo da borda.
// O núcleo (esfr.ts) foi validado contra borda Gaussiana (erro < 1%).

const MAX_LARGURA = 720; // largura de exibição do canvas

export function TesteResolucao() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null); // imagem em resolução plena
  const escalaExibRef = useRef(1); // imagem_px por canvas_px
  const arrasteRef = useRef<{ x0: number; y0: number } | null>(null);

  const [temImagem, setTemImagem] = useState(false);
  const [roi, setRoi] = useState<Roi | null>(null);
  const [resultado, setResultado] = useState<ResultadoMtf | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escalaPxMm, setEscalaPxMm] = useState(''); // px/mm no objeto (opcional)

  function desenhar(roiAtual: Roi | null) {
    const canvas = canvasRef.current;
    const full = imageDataRef.current;
    if (!canvas || !full) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // desenha a imagem em resolução plena reescalada para o canvas de exibição
    const off = document.createElement('canvas');
    off.width = full.width;
    off.height = full.height;
    off.getContext('2d')!.putImageData(full, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    if (roiAtual) {
      const s = escalaExibRef.current;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.strokeRect(roiAtual.x / s, roiAtual.y / s, roiAtual.w / s, roiAtual.h / s);
    }
  }

  async function carregarImagem(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setErro(null);
    setResultado(null);
    setRoi(null);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Não foi possível ler a imagem.'));
        img.src = url;
      });
      const full = document.createElement('canvas');
      full.width = img.naturalWidth;
      full.height = img.naturalHeight;
      const fctx = full.getContext('2d')!;
      fctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      imageDataRef.current = fctx.getImageData(0, 0, full.width, full.height);

      const canvas = canvasRef.current!;
      const s = img.naturalWidth > MAX_LARGURA ? img.naturalWidth / MAX_LARGURA : 1;
      escalaExibRef.current = s;
      canvas.width = Math.round(img.naturalWidth / s);
      canvas.height = Math.round(img.naturalHeight / s);
      setTemImagem(true);
      desenhar(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar imagem.');
    }
  }

  function coordCanvas(e: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  function mouseDown(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!temImagem) return;
    const { x, y } = coordCanvas(e);
    arrasteRef.current = { x0: x, y0: y };
  }
  function mouseMove(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!arrasteRef.current) return;
    const s = escalaExibRef.current;
    const { x, y } = coordCanvas(e);
    const { x0, y0 } = arrasteRef.current;
    const r: Roi = {
      x: Math.round(Math.min(x0, x) * s),
      y: Math.round(Math.min(y0, y) * s),
      w: Math.round(Math.abs(x - x0) * s),
      h: Math.round(Math.abs(y - y0) * s),
    };
    desenhar(r);
  }
  function mouseUp(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!arrasteRef.current) return;
    const s = escalaExibRef.current;
    const { x, y } = coordCanvas(e);
    const { x0, y0 } = arrasteRef.current;
    arrasteRef.current = null;
    const r: Roi = {
      x: Math.round(Math.min(x0, x) * s),
      y: Math.round(Math.min(y0, y) * s),
      w: Math.round(Math.abs(x - x0) * s),
      h: Math.round(Math.abs(y - y0) * s),
    };
    if (r.w < 20 || r.h < 20) {
      setErro('ROI muito pequena. Arraste um retângulo maior sobre a borda inclinada (mín. ~30x30 px).');
      setRoi(null);
      desenhar(null);
      return;
    }
    setErro(null);
    setRoi(r);
    desenhar(r);
  }

  function calcular() {
    const full = imageDataRef.current;
    if (!full || !roi) {
      setErro('Carregue a imagem e marque a ROI sobre a borda inclinada.');
      return;
    }
    try {
      const r = calcularMtfSlantedEdge(full, roi);
      if (!r.freq.length || Number.isNaN(r.anguloBordaGraus)) {
        setErro('Não foi possível detectar uma borda na ROI. Marque uma região com uma borda nítida e inclinada.');
        setResultado(null);
        return;
      }
      setErro(null);
      setResultado(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro no cálculo.');
    }
  }

  // Aviso sobre o ângulo da borda (ISO/12233 recomenda borda levemente
  // inclinada, ~2-10°; 0° ou muito inclinada degrada o e-SFR).
  const anguloAbs = resultado ? Math.abs(resultado.anguloBordaGraus) : 0;
  const anguloOk = resultado ? anguloAbs >= 2 && anguloAbs <= 15 : true;
  const escNum = Number(escalaPxMm.replace(',', '.'));
  const mtf50CicloMm =
    resultado && escNum > 0 && Number.isFinite(resultado.mtf50)
      ? paraCiclosPorMm(resultado.mtf50, escNum)
      : null;

  // Curva MTF como SVG simples (freq 0..~0.5 cyc/px no eixo x; MTF 0..1 em y).
  const curva = resultado ? construirCurva(resultado) : '';

  return (
    <div>
      <h1>Teste de resolução (ISO 8600-5)</h1>
      <p style={{ maxWidth: 720, color: 'var(--ink-400)', fontSize: 13 }}>
        Método e-SFR (borda inclinada). Capture a imagem do alvo de resolução (borda a ~5°) com a câmera
        monocromática, carregue aqui, marque uma <strong>ROI sobre uma borda inclinada</strong> e calcule a MTF.
        Fase 2 — a integração ao laudo/OS entra após a validação com a câmera real.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
        <label className="botao-secundario botao-pequeno" style={{ display: 'inline-block', cursor: 'pointer' }}>
          Carregar imagem (TIFF/PNG)
          <input type="file" accept="image/*" onChange={carregarImagem} style={{ display: 'none' }} />
        </label>
        <button className="botao-primario botao-pequeno" onClick={calcular} disabled={!roi}>
          Calcular MTF
        </button>
      </div>

      {erro && <p className="erro-login" style={{ maxWidth: 720 }}>{erro}</p>}

      {temImagem && (
        <canvas
          ref={canvasRef}
          onMouseDown={mouseDown}
          onMouseMove={mouseMove}
          onMouseUp={mouseUp}
          style={{ border: '1px solid #cbd5e1', maxWidth: '100%', cursor: 'crosshair' }}
        />
      )}

      {resultado && (
        <div style={{ maxWidth: 720, marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>MTF50</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{resultado.mtf50.toFixed(4)} ciclos/px</div>
              {mtf50CicloMm != null && (
                <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>≈ {mtf50CicloMm.toFixed(1)} ciclos/mm (objeto)</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Ângulo da borda</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: anguloOk ? '#16a34a' : '#dc2626' }}>
                {resultado.anguloBordaGraus.toFixed(2)}°
              </div>
              {!anguloOk && (
                <div style={{ fontSize: 12, color: '#dc2626' }}>Borda muito reta/inclinada — use ~2° a 10°.</div>
              )}
            </div>
          </div>

          <div className="campo-form" style={{ maxWidth: 320 }}>
            <label>Escala do objeto (px/mm) — opcional, p/ ciclos/mm</label>
            <input type="number" value={escalaPxMm} onChange={(e) => setEscalaPxMm(e.target.value)} placeholder="ex.: medida com alvo graduado" />
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-400)', marginBottom: 4 }}>Curva MTF (x: ciclos/px até 0,5 — Nyquist; y: 0 a 1)</div>
            <svg viewBox="0 0 320 160" width="320" height="160" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>
              {/* linha MTF=0.5 */}
              <line x1="0" y1="80" x2="320" y2="80" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" />
              <text x="2" y="76" fontSize="8" fill="#94a3b8">0,5</text>
              <polyline points={curva} fill="none" stroke="#08336a" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// Constrói os pontos da polyline da curva MTF (freq 0..0.5 cyc/px -> x 0..320;
// mtf 0..1 -> y 160..0).
function construirCurva(r: ResultadoMtf): string {
  const pts: string[] = [];
  for (let i = 0; i < r.freq.length; i++) {
    const f = r.freq[i];
    if (f > 0.5) break;
    const x = (f / 0.5) * 320;
    const y = 160 - Math.max(0, Math.min(1, r.mtf[i])) * 160;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}
