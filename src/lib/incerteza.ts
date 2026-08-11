// Estatística de repetibilidade (incerteza tipo A) para preencher a
// incerteza de medição exigida pelo laudo (ISO 8600-3 Clause 7: "incerteza
// para intervalo de confiança de 95%").
//
// A partir de N leituras repetidas do MESMO item:
//   media          = média das leituras (valor reportado)
//   desvioPadrao   = desvio-padrão amostral (n-1)
//   incertezaExpandida = k * s / sqrt(n), com k=2 (~95%) — incerteza da MÉDIA.

export interface EstatRepetibilidade {
  n: number;
  media: number;
  desvioPadrao: number;
  incertezaExpandida: number; // U (k=2)
}

// Converte um texto com números separados por vírgula, ponto-e-vírgula,
// espaço ou quebra de linha em um array de números (aceita vírgula decimal).
export function lerLeituras(texto: string): number[] {
  return texto
    .split(/[;,\n\t ]+/)
    .map((s) => s.trim().replace(',', '.'))
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export function estatisticaRepetibilidade(valores: number[]): EstatRepetibilidade | null {
  const n = valores.length;
  if (n < 2) return null;
  const media = valores.reduce((a, b) => a + b, 0) / n;
  const variancia = valores.reduce((acc, v) => acc + (v - media) ** 2, 0) / (n - 1);
  const desvioPadrao = Math.sqrt(variancia);
  const incertezaExpandida = (2 * desvioPadrao) / Math.sqrt(n);
  return { n, media, desvioPadrao, incertezaExpandida };
}
