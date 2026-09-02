// Normaliza as tags de "grupo de contagem" usadas no preço automático por
// quantidade (produtos_servicos.grupo_contagem_preco e
// cliente_precos_quantidade.grupo_contado/grupo_extra) - maiúsculo, sem
// acento, espaços viram "_". Sem isso, duas digitações razoáveis da mesma
// tag (ex.: "CÂNULA" vs "CANULA", ou "ROD LENS" vs "ROD_LENS") ficam como
// strings diferentes e a regra de preço simplesmente nunca bate, sem
// nenhum aviso - já aconteceu duas vezes na prática (2026-09-02).
export function normalizarTagContagem(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '_');
}
