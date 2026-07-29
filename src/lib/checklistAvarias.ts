// Checklist fixo de avarias identificadas na triagem - preenchido na
// Entrada do Equipamento (não mais em "Abrir Nova OS"); a OS criada a
// partir de uma entrada copia esse checklist para ordens_servico.triagem_avarias.
export const CHECKLIST_AVARIAS = [
  { key: 'tubo_amassado', label: 'Tubo de inox amassado / deformado' },
  { key: 'cristal_trincado', label: 'Lente distal / cristal trincado ou riscado' },
  { key: 'fibra_queimada', label: 'Guia de luz / fibras com queimaduras' },
  { key: 'ocular_solta', label: 'Ocular / acoplador com folga ou danificado' },
  { key: 'umidade_interna', label: 'Infiltração de umidade / fungos visíveis' },
] as const;

export type ChecklistAvarias = Record<string, boolean>;
