// Dados da empresa (usados no cabeçalho/rodapé dos relatórios) e helpers de
// formatação pt-BR (moeda com ponto de milhar e vírgula decimal).

export const EMPRESA = {
  razaoSocial: 'CVF MEDICAL MANUTENÇÃO EM EQUIPAMENTOS CIRÚRGICOS LTDA',
  cnpj: '46.948.692/0001-03',
  endereco: 'Rua Sete de Setembro, 1929 - Ribeirão Preto/SP - CEP 14.025-200',
  telefone: '', // TODO: preencher com o telefone oficial da CVF
  email: 'suporte@cvfmedical.com.br',
};

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNumero = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// R$ 12.600,00
export function formatarMoeda(valor: number | null | undefined): string {
  return fmtMoeda.format(Number(valor) || 0);
}

// 12.600,00 (sem o símbolo)
export function formatarNumero(valor: number | null | undefined): string {
  return fmtNumero.format(Number(valor) || 0);
}
