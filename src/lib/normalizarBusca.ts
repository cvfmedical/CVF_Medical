// Normaliza texto pra comparacao de busca/filtro - minuscula e sem
// acento (via unicode escape, sem depender de caractere combinante
// literal no arquivo-fonte) - assim "otica" acha "ÓTICA", "cirurgico"
// acha "CIRÚRGICO" etc. Usado em todo campo de busca/filtro do sistema
// (ComboboxBusca, filtro por coluna do CrudPage, telas com tabela própria).
const REGEX_DIACRITICOS = /[̀-ͯ]/g;

export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(REGEX_DIACRITICOS, '').toLowerCase();
}
