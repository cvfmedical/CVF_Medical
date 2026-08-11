// Cálculos de conformidade ISO 8600 para a Bancada de Visão.
//
// FOV — ISO 8600-3:2019 Método A: o alvo tem anéis concêntricos marcados em
// grau, projetados para 50 mm (diâmetro do anel D = 100·tan(β/2)). Em vez de
// depender de uma calibração pixel→mm frágil (sensível ao zoom/coupler), lemos
// o FOV a partir de DOIS anéis de grau conhecido presentes na própria imagem:
// como todos os anéis obedecem raioPx = k·50·tan(β/2), os anéis fornecem a
// escala angular local — imune à magnificação da câmera.
//
// Critérios de aprovação (ISO 8600-1:2024):
//   §4.5  FOV: desvio ≤ 15% do valor de referência (golden sample).
//   §4.6  Direção de visão: desvio ≤ 10° do nominal.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface AnelReferencia {
  grau: number; // ângulo marcado no anel do alvo (ex.: 40, 80)
  raioPx: number; // raio do anel, em pixels, medido na imagem
}

// Fator de escala angular s = tan(β/2)/raioPx — constante do alvo (a 50 mm),
// idêntico para todos os anéis quando não há distorção nem desalinhamento.
export function fatorEscalaAnel(anel: AnelReferencia): number {
  return Math.tan((anel.grau * RAD) / 2) / anel.raioPx;
}

export interface ResultadoFov {
  fovGraus: number;
  incertezaGraus: number; // incerteza expandida (k=2, ~95%)
  fatoresEscala: number[]; // s de cada anel, para auditoria
  divergenciaPct: number; // divergência entre anéis (indicador de distorção/alinhamento)
}

// FOV pela leitura de 2+ anéis de grau conhecido (ISO 8600-3 Método A).
export function fovPorAneis(raioCampoPx: number, aneis: AnelReferencia[]): ResultadoFov {
  if (aneis.length < 2) throw new Error('São necessários pelo menos 2 anéis de referência.');
  const fatores = aneis.map(fatorEscalaAnel);
  const sMedio = fatores.reduce((a, b) => a + b, 0) / fatores.length;

  const tanMeia = raioCampoPx * sMedio;
  const fovGraus = 2 * Math.atan(tanMeia) * DEG;

  const sMin = Math.min(...fatores);
  const sMax = Math.max(...fatores);
  const divergenciaPct = sMedio > 0 ? ((sMax - sMin) / sMedio) * 100 : 0;

  // Incerteza tipo B simplificada: propaga a dispersão dos fatores de escala
  // dos anéis para o FOV, via ∂FOV/∂s = 2·raioCampoPx/(1+tan²)·(180/π).
  // Documentada e conservadora; a equipe de qualidade pode refinar o orçamento
  // de incerteza (incluir distância, alinhamento, resolução de leitura).
  const dFovdS = ((2 * raioCampoPx) / (1 + tanMeia * tanMeia)) * DEG;
  const desvioS =
    fatores.length > 1
      ? Math.sqrt(fatores.reduce((acc, s) => acc + (s - sMedio) ** 2, 0) / (fatores.length - 1))
      : 0;
  const uPadrao = Math.abs(dFovdS) * (desvioS / Math.sqrt(fatores.length));
  const incertezaGraus = 2 * uPadrao;

  return { fovGraus, incertezaGraus, fatoresEscala: fatores, divergenciaPct };
}

// Desvio percentual do FOV medido em relação à referência (golden sample).
export function desvioFovPct(medidoGraus: number, referenciaGraus: number): number {
  if (!referenciaGraus) return NaN;
  return (Math.abs(medidoGraus - referenciaGraus) / referenciaGraus) * 100;
}

// ISO 8600-1 §4.5 — FOV conforme se o desvio ≤ tolerância (padrão 15%).
export function conformeFov(medidoGraus: number, referenciaGraus: number, tolPct = 15): boolean {
  const d = desvioFovPct(medidoGraus, referenciaGraus);
  return Number.isFinite(d) && d <= tolPct;
}

// ISO 8600-1 §4.6 — direção de visão conforme se |medida − nominal| ≤ tol (padrão 10°).
export function conformeDirecao(medidaGraus: number, nominalGraus: number, tolGraus = 10): boolean {
  return Math.abs(medidaGraus - nominalGraus) <= tolGraus;
}

// Condição de validade do Método A (ISO 8600-3 §4.1): distância de medição
// deve ser ≥ 30× a distância entre a ponta distal e a pupila de entrada.
// Se a distância pupilar for desconhecida, retorna null (não é possível avaliar).
export function metodoAValido(distanciaMedicaoMm: number, distanciaPupilarMm: number | null): boolean | null {
  if (distanciaPupilarMm == null || distanciaPupilarMm <= 0) return null;
  return distanciaMedicaoMm >= 30 * distanciaPupilarMm;
}
