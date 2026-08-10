// Carrega o OpenCV.js OFICIAL via <script> do CDN (docs.opencv.org).
//
// Antes usávamos o pacote @techstark/opencv-js importado pelo bundler.
// Depois do build/minify do Vite, o runtime WebAssembly não inicializava
// de forma confiável (o objeto `cv` ficava sem `Mat`/`calledRun`), então
// a Bancada de Visão travava em "Carregando motor...". O build oficial,
// carregado por script separado, inicializa via `onRuntimeInitialized`.
//
// A tipagem real fica a cargo de quem consome (metrologiaOptica.ts), que
// documenta os métodos usados — aqui tratamos como `any` de propósito.

// Hospedado no próprio site (public/opencv.js), servido pela mesma CDN
// do Cloudflare - carrega rápido e sem depender de um domínio externo.
// É o build oficial do OpenCV 4.8.0 (docs.opencv.org).
const OPENCV_CDN_URL = '/opencv.js';
const SCRIPT_ID = 'opencv-js-cdn';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cvPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function carregarOpenCv(): Promise<any> {
  if (cvPromise) return cvPromise;

  cvPromise = new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;

    const quandoPronto = () => resolve(w.cv);

    // Já carregado e com runtime inicializado.
    if (w.cv && w.cv.Mat) return resolve(w.cv);

    // Script já injetado (carregando) - só aguardar o runtime.
    if (document.getElementById(SCRIPT_ID)) {
      if (w.cv) w.cv.onRuntimeInitialized = quandoPronto;
      return;
    }

    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.async = true;
    s.src = OPENCV_CDN_URL;
    s.onload = () => {
      if (w.cv && w.cv.Mat) return quandoPronto();
      if (w.cv) {
        w.cv.onRuntimeInitialized = quandoPronto;
        return;
      }
      reject(new Error('OpenCV carregou mas não expôs o objeto "cv".'));
    };
    s.onerror = () => reject(new Error('Falha ao carregar o OpenCV do CDN.'));
    document.head.appendChild(s);
  });

  return cvPromise;
}
