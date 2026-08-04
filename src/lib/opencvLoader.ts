// Carrega o OpenCV.js (WebAssembly) sob demanda - só é importado pela
// tela de Bancada de Visão, então não pesa no bundle principal do app
// (a lib inteira tem alguns MB). Mesmo padrão de inicialização
// recomendado pelo pacote @techstark/opencv-js.
//
// O pacote não exporta um tipo TS utilizável para o módulo default (só
// declara os tipos das classes individuais do OpenCV) - tratamos como
// `any` aqui de propósito; a tipagem de uso real fica a cargo de quem
// consome (metrologiaOptica.ts), que documenta os métodos usados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cvPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function carregarOpenCv(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod = await import('@techstark/opencv-js');
      const cvModule = mod.default as unknown as { Mat?: unknown; onRuntimeInitialized?: () => void; then?: unknown };
      if (cvModule && typeof cvModule.then === 'function') {
        return await (cvModule as unknown as Promise<unknown>);
      }
      if (!cvModule.Mat) {
        await new Promise<void>((resolve) => {
          cvModule.onRuntimeInitialized = () => resolve();
        });
      }
      return cvModule;
    })();
  }
  return cvPromise;
}
