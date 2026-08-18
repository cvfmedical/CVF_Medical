// Checklist fixo de avarias identificadas na triagem - preenchido na
// Entrada do Equipamento (não mais em "Abrir Nova OS"); a OS criada a
// partir de uma entrada copia esse checklist para ordens_servico.triagem_avarias.
export interface ItemChecklistAvaria {
  key: string;
  label: string;
  // Opcional: quando marcado, o item só aparece na triagem se o produto
  // selecionado pertencer a esse grupo/subgrupo (mesma marcação usada em
  // Observações de defeito). Sem grupo definido, aparece sempre - é o caso
  // dos 5 itens atuais, todos específicos de ótica/endoscópio.
  grupo?: string;
  subgrupo?: string;
}

export const CHECKLIST_AVARIAS: ItemChecklistAvaria[] = [
  { key: 'tubo_amassado', label: 'Tubo de inox amassado / deformado' },
  { key: 'cristal_trincado', label: 'Lente distal / cristal trincado ou riscado' },
  { key: 'fibra_queimada', label: 'Guia de luz / fibras com queimaduras' },
  { key: 'ocular_solta', label: 'Ocular / acoplador com folga ou danificado' },
  { key: 'umidade_interna', label: 'Infiltração de umidade / fungos visíveis' },
];

export type ChecklistAvarias = Record<string, boolean>;
