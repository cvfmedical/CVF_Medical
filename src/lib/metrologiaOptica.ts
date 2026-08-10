// Porte de bancada_visao.py::calcular_nitidez/calcular_luminosidade/
// calcular_metrologia_optica para OpenCV.js - mesma matemática, mesmos
// limiares (ver BancadaVisaoPdf.tsx para os critérios CONFORME/NÃO
// CONFORME, copiados de gerador_pdf.py).
//
// Frames aqui vêm de canvas.getImageData() (RGBA), não de cv2.VideoCapture
// (BGR) como no Python - a ordem dos canais não afeta os cálculos, que
// são simétricos entre os 3 canais de cor.
// O pacote @techstark/opencv-js não expõe um tipo utilizável para o
// módulo default nem para Mat/MatVector - tratamos como `any` (mesmo
// padrão necessário em qualquer projeto que consome essa lib).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cv = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mat = any;

export interface MetricasOticas {
  nitidez: number;
  luz: number;
  fov: number;
  desvio: number;
  vinheta: number;
  cor: number;
  distorcao: number;
}

function calcularNitidez(cv: Cv, gray: Mat): number {
  const laplacian = new cv.Mat();
  cv.Laplacian(gray, laplacian, cv.CV_64F);
  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  cv.meanStdDev(laplacian, mean, stddev);
  const desvio = stddev.data64F[0];
  laplacian.delete();
  mean.delete();
  stddev.delete();
  return desvio * desvio;
}

function calcularLuminosidade(cv: Cv, gray: Mat): number {
  return cv.mean(gray)[0];
}

function calcularMetrologiaOptica(cv: Cv, frame: Mat, gray: Mat, fatorCalib: number) {
  const h = frame.rows;
  const w = frame.cols;
  const cxTela = w / 2.0;
  const cyTela = h / 2.0;

  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

  const thresh = new cv.Mat();
  cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let fovCalculado = 0.0;
  let desvioMm = 0.0;
  let vinheta = 0.0;
  let desvioCor = 0.0;
  let distorcao = 0.0;

  let maiorContorno: Mat | null = null;
  let maiorArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area > w * h * 0.01 && area < w * h * 0.9 && area > maiorArea) {
      maiorArea = area;
      maiorContorno = c;
    }
  }

  if (maiorContorno) {
    const area = maiorArea;
    const circulo = cv.minEnclosingCircle(maiorContorno);
    const xCentro = circulo.center.x;
    const yCentro = circulo.center.y;
    const raioPx = circulo.radius;

    const distanciaPx = Math.sqrt((xCentro - cxTela) ** 2 + (yCentro - cyTela) ** 2);
    desvioMm = distanciaPx * fatorCalib;
    if (desvioMm === 0.0 && distanciaPx > 0) desvioMm = 0.01;

    const raioMm = raioPx * fatorCalib;
    if (raioMm > 0) {
      // Distância de referência ISO 8600-3 do alvo Método A da CVF = 50 mm.
      fovCalculado = 2 * Math.atan(raioMm / 50.0) * (180 / Math.PI);
    }

    const maskCentro = cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8UC1);
    cv.circle(maskCentro, new cv.Point(xCentro, yCentro), Math.max(1, Math.round(raioPx * 0.3)), new cv.Scalar(255), -1);

    const maskBorda = cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8UC1);
    cv.circle(maskBorda, new cv.Point(xCentro, yCentro), Math.max(1, Math.round(raioPx * 0.9)), new cv.Scalar(255), -1);
    cv.circle(maskBorda, new cv.Point(xCentro, yCentro), Math.max(1, Math.round(raioPx * 0.7)), new cv.Scalar(0), -1);

    const luzCentro = cv.mean(gray, maskCentro)[0];
    const luzBorda = cv.mean(gray, maskBorda)[0];
    if (luzCentro > 0) {
      vinheta = Math.max(0.0, 100.0 * (1.0 - luzBorda / luzCentro));
    }

    const meanCor = cv.mean(frame, maskCentro);
    const canais = [meanCor[0], meanCor[1], meanCor[2]];
    const mediaGeral = (canais[0] + canais[1] + canais[2]) / 3.0;
    if (mediaGeral > 0) {
      const somaQuad = canais.reduce((acc, c) => acc + (c - mediaGeral) ** 2, 0);
      desvioCor = (Math.sqrt(somaQuad / 3.0) / 255.0) * 100.0;
    }

    const perimetro = cv.arcLength(maiorContorno, true);
    if (perimetro > 0) {
      const circularidade = (4 * Math.PI * area) / (perimetro * perimetro);
      distorcao = Math.abs(1.0 - circularidade) * 100.0;
    }

    maskCentro.delete();
    maskBorda.delete();
  } else {
    const m = cv.moments(gray, false);
    if (m.m00 > 0) {
      const cX = m.m10 / m.m00;
      const cY = m.m01 / m.m00;
      const distanciaPx = Math.sqrt((cX - cxTela) ** 2 + (cY - cyTela) ** 2);
      desvioMm = Math.max(0.01, distanciaPx * fatorCalib);
      const luzMedia = cv.mean(gray)[0];
      fovCalculado = Math.max(10.0, (luzMedia / 255.0) * 100.0);
    }
  }

  blurred.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();

  return { fov: fovCalculado, desvio: desvioMm, vinheta, cor: desvioCor, distorcao };
}

// Recebe o ImageData de um <canvas> (RGBA) e devolve as 7 métricas -
// cuida da criação/limpeza dos Mats do OpenCV.js internamente.
export function calcularMetricas(cv: Cv, imageData: ImageData, fatorCalib: number): MetricasOticas {
  const frame = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

  const nitidez = calcularNitidez(cv, gray);
  const luz = calcularLuminosidade(cv, gray);
  const { fov, desvio, vinheta, cor, distorcao } = calcularMetrologiaOptica(cv, frame, gray, fatorCalib);

  frame.delete();
  gray.delete();

  return { nitidez, luz, fov, desvio, vinheta, cor, distorcao };
}

// Detecta o alvo de calibração no frame e devolve o diâmetro em pixels
// (usado pelo fluxo "Calibrar" - pede o diâmetro real em mm e calcula
// o fator pixel->mm).
export function detectarDiametroAlvo(cv: Cv, imageData: ImageData): number | null {
  const frame = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  const thresh = new cv.Mat();
  cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let maiorContorno: Mat | null = null;
  let maiorArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area > maiorArea) {
      maiorArea = area;
      maiorContorno = c;
    }
  }

  let diametroPx: number | null = null;
  if (maiorContorno) {
    const circulo = cv.minEnclosingCircle(maiorContorno);
    diametroPx = 2 * circulo.radius;
  }

  frame.delete();
  gray.delete();
  blurred.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();

  return diametroPx;
}

export const FATOR_CALIB_PADRAO = 0.035;

// Limiares de aprovação - idênticos a gerador_pdf.py (seções 8, 9, 10).
export function statusMetricas(m: MetricasOticas) {
  const stNitidez = m.nitidez >= 150.0;
  const stLuz = m.luz >= 40.0;
  const stFov = m.fov >= 45.0 && m.fov <= 130.0;
  const stDesvio = m.desvio <= 0.5;
  const stVinheta = m.vinheta <= 25.0;
  const stCor = m.cor <= 10.0;
  const stDistorcao = m.distorcao <= 5.0;
  const conforme = stNitidez && stLuz && stFov && stDesvio && stVinheta && stCor && stDistorcao;
  return { stNitidez, stLuz, stFov, stDesvio, stVinheta, stCor, stDistorcao, conforme };
}
