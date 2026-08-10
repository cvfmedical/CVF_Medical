// Cliente do Web Worker que roda o OpenCV (public/opencvWorker.js).
// Toda a análise pesada acontece na thread do worker, então a tela da
// Bancada de Visão nunca trava, nem durante a carga do OpenCV.

import type { MetricasOticas } from './metrologiaOptica';

let worker: Worker | null = null;
let prontoPromise: Promise<void> | null = null;
let seq = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pendentes = new Map<number, { resolve: (v: any) => void; reject: (e: unknown) => void }>();

// Inicia o worker e resolve quando o OpenCV terminou de carregar/compilar.
export function iniciarOpenCvWorker(): Promise<void> {
  if (prontoPromise) return prontoPromise;
  prontoPromise = new Promise<void>((resolve, reject) => {
    try {
      worker = new Worker('/opencvWorker.js');
    } catch {
      reject(new Error('Não foi possível iniciar o worker do OpenCV.'));
      return;
    }
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as { type: string; id?: number; mensagem?: string };
      if (data.type === 'ready') {
        resolve();
        return;
      }
      if (data.id == null) return;
      const p = pendentes.get(data.id);
      if (!p) return;
      pendentes.delete(data.id);
      if (data.type === 'erro') p.reject(new Error(data.mensagem ?? 'Erro no worker.'));
      else p.resolve(data);
    };
    worker.onerror = () => reject(new Error('Falha no worker do OpenCV.'));
  });
  return prontoPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enviar(msg: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!worker) return reject(new Error('Worker do OpenCV não iniciado.'));
    const id = ++seq;
    pendentes.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
}

export async function calcularMetricasWorker(imageData: ImageData, fator: number): Promise<MetricasOticas> {
  const r = await enviar({ type: 'metricas', imageData, fator });
  return r.metricas as MetricasOticas;
}

export async function detectarDiametroWorker(imageData: ImageData): Promise<number | null> {
  const r = await enviar({ type: 'diametro', imageData });
  return r.diametroPx as number | null;
}
