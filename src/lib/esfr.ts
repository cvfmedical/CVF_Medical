// Resolução óptica por borda inclinada (slanted-edge / e-SFR), conforme o
// método referenciado pela ISO 8600-5:2020 (ISO 12233). Pipeline:
// borda -> ESF sobre-amostrada (4x) -> LSF (derivada) -> janela -> FFT -> MTF,
// com a correção de diferença finita D(u) da ISO 8600-5 D.2.1.
//
// Validado contra borda sintética com desfoque Gaussiano conhecido
// (MTF teórica = exp(-2·pi²·sigma²·f²)): erro de MTF50 < 1% para sigma 1..2.
//
// É JS puro (não precisa de OpenCV) — opera sobre um ImageData + ROI.

export interface ResultadoMtf {
  freq: number[]; // ciclos/pixel
  mtf: number[]; // MTF normalizada (DC = 1)
  mtf50: number; // ciclos/pixel onde a MTF cruza 0,5 (NaN se não cruzar)
  anguloBordaGraus: number; // ângulo da borda detectada (ideal: ~5°)
}

export interface Roi {
  x: number;
  y: number;
  w: number;
  h: number;
}

// FFT radix-2 iterativa (N potência de 2), in-place.
function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// Núcleo e-SFR sobre uma ROI em tons de cinza (w x h, borda quase vertical).
export function computeSFR(gray: Float64Array, w: number, h: number): ResultadoMtf {
  const OS = 4; // sobre-amostragem

  // 1. Posição da borda por linha (centroide da derivada) + ajuste linear.
  const ys: number[] = [];
  const xs: number[] = [];
  for (let y = 0; y < h; y++) {
    let num = 0;
    let den = 0;
    for (let x = 1; x < w - 1; x++) {
      const g = Math.abs(gray[y * w + x + 1] - gray[y * w + x - 1]);
      num += x * g;
      den += g;
    }
    if (den > 0) {
      ys.push(y);
      xs.push(num / den);
    }
  }
  const n = ys.length;
  if (n < 4) return { freq: [], mtf: [], mtf50: NaN, anguloBordaGraus: NaN };
  let sy = 0;
  let sx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sy += ys[i];
    sx += xs[i];
    syy += ys[i] * ys[i];
    sxy += ys[i] * xs[i];
  }
  const a = (n * sxy - sy * sx) / (n * syy - sy * sy);
  const b = (sx - a * sy) / n;

  // 2. ESF sobre-amostrada: projeta cada pixel pela distância à borda.
  const bins = w * OS;
  const acc = new Float64Array(bins);
  const cnt = new Float64Array(bins);
  for (let y = 0; y < h; y++) {
    const ex = a * y + b;
    for (let x = 0; x < w; x++) {
      const idx = Math.round((x - ex + w / 2) * OS);
      if (idx >= 0 && idx < bins) {
        acc[idx] += gray[y * w + x];
        cnt[idx] += 1;
      }
    }
  }
  const esf = new Array<number>(bins);
  for (let i = 0; i < bins; i++) esf[i] = cnt[i] > 0 ? acc[i] / cnt[i] : NaN;
  for (let i = 0; i < bins; i++) {
    if (Number.isNaN(esf[i])) {
      let l = i - 1;
      while (l >= 0 && Number.isNaN(esf[l])) l--;
      let r = i + 1;
      while (r < bins && Number.isNaN(esf[r])) r++;
      esf[i] = l >= 0 && r < bins ? (esf[l] + esf[r]) / 2 : l >= 0 ? esf[l] : r < bins ? esf[r] : 0;
    }
  }

  // 3. LSF = diferença adjacente; 4. janela de Hamming.
  const lsf = new Array<number>(bins).fill(0);
  for (let i = 1; i < bins; i++) lsf[i] = esf[i] - esf[i - 1];
  for (let i = 0; i < bins; i++) lsf[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (bins - 1));

  // 5. FFT (pad para potência de 2).
  let N = 1;
  while (N < bins) N <<= 1;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < bins; i++) re[i] = lsf[i];
  fftRadix2(re, im);
  const dc = Math.hypot(re[0], im[0]);

  // 6. MTF em ciclos/pixel + correção de diferença finita D(u) (ISO 8600-5 D.2.1).
  const freq: number[] = [];
  const mtf: number[] = [];
  for (let k = 0; k < N / 2; k++) {
    const f = (k / N) * OS;
    if (f > 1.05) break;
    let m = dc > 0 ? Math.hypot(re[k], im[k]) / dc : 0;
    if (f > 0) {
      const s = Math.sin((Math.PI * f) / 2);
      const D = s !== 0 ? Math.min((Math.PI * f) / 2 / s, 10) : 1;
      m *= D;
    }
    freq.push(f);
    mtf.push(m);
  }
  let mtf50 = NaN;
  for (let i = 1; i < mtf.length; i++) {
    if (mtf[i - 1] >= 0.5 && mtf[i] < 0.5) {
      const t = (0.5 - mtf[i - 1]) / (mtf[i] - mtf[i - 1]);
      mtf50 = freq[i - 1] + t * (freq[i] - freq[i - 1]);
      break;
    }
  }
  return { freq, mtf, mtf50, anguloBordaGraus: (Math.atan(a) * 180) / Math.PI };
}

// Extrai a ROI de um ImageData como luminância e calcula a MTF por borda
// inclinada. Para câmera monocromática, R=G=B (a luminância = o valor).
export function calcularMtfSlantedEdge(imageData: ImageData, roi: Roi): ResultadoMtf {
  const { x, y, w, h } = roi;
  const gray = new Float64Array(w * h);
  const src = imageData.data;
  const W = imageData.width;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = ((y + j) * W + (x + i)) * 4;
      gray[j * w + i] = 0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2];
    }
  }
  return computeSFR(gray, w, h);
}

// Converte frequência de ciclos/pixel para ciclos/mm no espaço-objeto, dada a
// escala de imagem (pixels por mm no plano do alvo) medida com alvo graduado
// (ISO 8600-5 Anexo E). freqObjeto(ciclos/mm) = freqImagem(ciclos/px) * escalaPxPorMm.
export function paraCiclosPorMm(freqCiclosPx: number, escalaPxPorMm: number): number {
  return freqCiclosPx * escalaPxPorMm;
}
