// Avarias identificadas na triagem - guardadas como {chave: marcado} no
// jsonb triagem_avarias (entradas_equipamento/ordens_servico). A partir da
// migration 064, a lista de avarias disponíveis é um cadastro editável
// (tabela avarias_triagem, ver useAvariasTriagem.ts) - a chave usada aqui é
// o id do cadastro, como string.
export type ChecklistAvarias = Record<string, boolean>;
