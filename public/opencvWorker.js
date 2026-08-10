/* eslint-disable */
// Web Worker que roda o OpenCV.js e toda a metrologia ISO 8600 FORA da
// thread principal. Assim o carregamento (10 MB + compilação do WASM) e a
// análise de cada frame não travam a tela da Bancada de Visão.
//
// A matemática é a mesma de src/lib/metrologiaOptica.ts (mantida em sincronia).
// Este arquivo é servido estático (public/) e usa importScripts, por isso
// é JS puro (não passa pelo bundler).

importScripts('/opencv.js');

function calcularNitidez(cv, gray) {
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

function calcularLuminosidade(cv, gray) {
  return cv.mean(gray)[0];
}

function calcularMetrologiaOptica(cv, frame, gray, fatorCalib) {
  const h = frame.rows;
  const w = frame.cols;
  const cxTela = w / 2.0;
  const cyTela = h / 2.0;

  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);
  // Isola o CAMPO ILUMINADO do endoscópio (claro) do fundo escuro por Otsu.
  // Assim pegamos o contorno do campo (o círculo), ignorando a textura interna
  // (anéis, régua, texto) - que o adaptiveThreshold antigo capturava por engano.
  const thresh = new cv.Mat();
  cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  // Fecha os buracos internos (linhas dos anéis) p/ o campo virar um blob sólido.
  const kernel = cv.Mat.ones(9, 9, cv.CV_8U);
  cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  kernel.delete();

  let fovCalculado = 0.0;
  let desvioMm = 0.0;
  let vinheta = 0.0;
  let desvioCor = 0.0;
  let distorcao = 0.0;

  // O campo do endoscópio é o maior blob claro (5% a 98% da tela).
  let maiorContorno = null;
  let maiorArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area > w * h * 0.05 && area < w * h * 0.98 && area > maiorArea) {
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
    // Distância de referência ISO 8600-3 do alvo Método A da CVF = 50 mm.
    if (raioMm > 0) fovCalculado = 2 * Math.atan(raioMm / 50.0) * (180 / Math.PI);

    const maskCentro = cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8UC1);
    cv.circle(maskCentro, new cv.Point(xCentro, yCentro), Math.max(1, Math.round(raioPx * 0.3)), new cv.Scalar(255), -1);
    const maskBorda = cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8UC1);
    cv.circle(maskBorda, new cv.Point(xCentro, yCentro), Math.max(1, Math.round(raioPx * 0.9)), new cv.Scalar(255), -1);
    cv.circle(maskBorda, new cv.Point(xCentro, yCentro), Math.max(1, Math.round(raioPx * 0.7)), new cv.Scalar(0), -1);

    const luzCentro = cv.mean(gray, maskCentro)[0];
    const luzBorda = cv.mean(gray, maskBorda)[0];
    if (luzCentro > 0) vinheta = Math.max(0.0, 100.0 * (1.0 - luzBorda / luzCentro));

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

function calcularMetricas(cv, imageData, fatorCalib) {
  const frame = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
  const nitidez = calcularNitidez(cv, gray);
  const luz = calcularLuminosidade(cv, gray);
  const resto = calcularMetrologiaOptica(cv, frame, gray, fatorCalib);
  frame.delete();
  gray.delete();
  return { nitidez, luz, fov: resto.fov, desvio: resto.desvio, vinheta: resto.vinheta, cor: resto.cor, distorcao: resto.distorcao };
}

function detectarDiametroAlvo(cv, imageData) {
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
  let maiorContorno = null;
  let maiorArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area > maiorArea) {
      maiorArea = area;
      maiorContorno = c;
    }
  }
  let diametroPx = null;
  if (maiorContorno) diametroPx = 2 * cv.minEnclosingCircle(maiorContorno).radius;
  frame.delete();
  gray.delete();
  blurred.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();
  return diametroPx;
}

// cv fica disponível após a compilação do WASM (onRuntimeInitialized).
function quandoPronto(cb) {
  if (self.cv && self.cv.Mat) return cb();
  self.cv.onRuntimeInitialized = cb;
}

quandoPronto(() => {
  postMessage({ type: 'ready' });
});

onmessage = (e) => {
  const cv = self.cv;
  const { type, id, imageData, fator } = e.data;
  try {
    if (type === 'metricas') {
      postMessage({ type: 'metricas', id, metricas: calcularMetricas(cv, imageData, fator) });
    } else if (type === 'diametro') {
      postMessage({ type: 'diametro', id, diametroPx: detectarDiametroAlvo(cv, imageData) });
    }
  } catch (err) {
    postMessage({ type: 'erro', id, mensagem: String(err) });
  }
};
