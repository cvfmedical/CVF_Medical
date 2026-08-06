// Espelho de STATUS_OS_ORDENADOS em cadastros.py. Fluxo real (plano de
// migração, seção 4): qualquer reprovação nos checkpoints 5, 7, 8 ou 9
// retorna a OS para "4. EM MANUTENÇÃO".
export const STATUS_OS_ORDENADOS = [
  '1. TRIAGEM / RECEBIMENTO',
  '2. AGUARDANDO ORÇAMENTO',
  '3. AGUARDANDO APROVAÇÃO DO CLIENTE',
  '4. EM MANUTENÇÃO',
  '5. BANCADA DE VISÃO - CHECKPOINT A',
  '6. SELAGEM',
  '7. TESTE DE ESTANQUEIDADE',
  '8. TESTE DE AUTOCLAVE',
  '9. BANCADA DE VISÃO - CHECKPOINT B',
  '10. PRONTO PARA ENTREGA',
  '11. ENTREGUE AO CLIENTE',
] as const;

export const STATUS_VOLTA_MANUTENCAO = '4. EM MANUTENÇÃO';
export const STATUS_TRIAGEM = '1. TRIAGEM / RECEBIMENTO';
export const STATUS_AGUARDANDO_ORCAMENTO = '2. AGUARDANDO ORÇAMENTO';
export const STATUS_CHECKPOINT_A = '5. BANCADA DE VISÃO - CHECKPOINT A';
export const STATUS_SELAGEM = '6. SELAGEM';
export const STATUS_CHECKPOINT_B = '9. BANCADA DE VISÃO - CHECKPOINT B';
export const STATUS_PRONTO_ENTREGA = '10. PRONTO PARA ENTREGA';

// Desvios do fluxo normal (fora da sequência numerada 1-11) - não são
// "avanços", são saídas do fluxo de reparo.
export const STATUS_DEVOLUCAO_SEM_REPARO = 'Devolução sem reparo (orçamento recusado)';

// Caminho alternativo ao Checkpoint A: substitui a sequência inteira
// 6 (Selagem) -> 7 (Estanqueidade) -> 8 (Autoclave) pra equipamentos que
// não são óticas seláveis - o técnico escolhe na hora do Checkpoint A.
// Os dois caminhos convergem de volta no Checkpoint B (9).
export const STATUS_TESTE_QUALIDADE = '6B. TESTE DE QUALIDADE / FUNCIONAMENTO';
