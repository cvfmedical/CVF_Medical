import type { TonoBadge } from '../components/Badge';

// Espelho de STATUS_OS_ORDENADOS em cadastros.py. Fluxo real (plano de
// migração, seção 4): qualquer reprovação nos checkpoints 5, 7, 8 ou 9
// retorna a OS para "4. EM MANUTENÇÃO".
export const STATUS_OS_ORDENADOS = [
  '1. TRIAGEM / RECEBIMENTO',
  '2. AGUARDANDO ORÇAMENTO',
  '2B. AGUARDANDO PRECIFICAÇÃO',
  '3. AGUARDANDO APROVAÇÃO DO CLIENTE',
  '4. EM MANUTENÇÃO',
  '5. BANCADA DE VISÃO - CHECKPOINT A',
  '7. TESTE DE ESTANQUEIDADE',
  '8. TESTE DE AUTOCLAVE',
  '9. BANCADA DE VISÃO - CHECKPOINT B',
  '10. PRONTO PARA ENTREGA',
  '11. ENTREGUE AO CLIENTE',
] as const;

export const STATUS_VOLTA_MANUTENCAO = '4. EM MANUTENÇÃO';
export const STATUS_TRIAGEM = '1. TRIAGEM / RECEBIMENTO';
export const STATUS_AGUARDANDO_ORCAMENTO = '2. AGUARDANDO ORÇAMENTO';
export const STATUS_AGUARDANDO_PRECIFICACAO = '2B. AGUARDANDO PRECIFICAÇÃO';
export const STATUS_CHECKPOINT_A = '5. BANCADA DE VISÃO - CHECKPOINT A';
export const STATUS_TESTE_ESTANQUEIDADE = '7. TESTE DE ESTANQUEIDADE';
export const STATUS_TESTE_AUTOCLAVE = '8. TESTE DE AUTOCLAVE';
export const STATUS_CHECKPOINT_B = '9. BANCADA DE VISÃO - CHECKPOINT B';
export const STATUS_PRONTO_ENTREGA = '10. PRONTO PARA ENTREGA';

// Desvios do fluxo normal (fora da sequência numerada 1-11) - não são
// "avanços", são saídas do fluxo de reparo.
export const STATUS_DEVOLUCAO_SEM_REPARO = 'Devolução sem reparo (orçamento recusado)';

// Caminho alternativo ao Checkpoint A: substitui a sequência
// Estanqueidade (7) -> Autoclave (8) pra equipamentos que não são óticas
// seláveis - o técnico escolhe na hora do Checkpoint A. A etapa de Selagem
// foi removida do fluxo (não é mais rastreada como status próprio - quem
// precisa dela vai direto de "Checkpoint A" pra "Teste de estanqueidade").
// Os dois caminhos convergem de volta no Checkpoint B (9).
export const STATUS_TESTE_QUALIDADE = '6B. TESTE DE QUALIDADE / FUNCIONAMENTO';

// Cor por status: ambar = fila/espera, copper = ação/aprovação/em
// manutenção, roxo = em teste de laboratório, teal = concluído, danger =
// crítico/reprovado. Agrupa os 11 status em 5 famílias de cor deliberadamente
// (mais que isso vira ruído visual pra quem tem dificuldade com cor).
export function tonoDoStatusOS(status: string | null | undefined): TonoBadge {
  if (!status) return 'neutro';
  if (status === STATUS_DEVOLUCAO_SEM_REPARO) return 'danger';
  if (
    status === STATUS_TRIAGEM ||
    status === STATUS_AGUARDANDO_ORCAMENTO ||
    status === STATUS_AGUARDANDO_PRECIFICACAO
  ) {
    return 'ambar';
  }
  if (status === '3. AGUARDANDO APROVAÇÃO DO CLIENTE' || status === STATUS_VOLTA_MANUTENCAO) {
    return 'copper';
  }
  if (
    status === STATUS_CHECKPOINT_A ||
    status === STATUS_TESTE_QUALIDADE ||
    status === STATUS_TESTE_ESTANQUEIDADE ||
    status === STATUS_TESTE_AUTOCLAVE ||
    status === STATUS_CHECKPOINT_B
  ) {
    return 'roxo';
  }
  if (status === STATUS_PRONTO_ENTREGA || status === '11. ENTREGUE AO CLIENTE') return 'teal';
  return 'neutro';
}
