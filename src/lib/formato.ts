// Dados da empresa (usados no cabeçalho/rodapé dos relatórios) e helpers de
// formatação pt-BR (moeda com ponto de milhar e vírgula decimal).

export const EMPRESA = {
  razaoSocial: 'CVF MEDICAL MANUTENÇÃO EM EQUIPAMENTOS CIRÚRGICOS LTDA',
  cnpj: '46.948.692/0001-03',
  endereco: 'Rua Sete de Setembro, 1929 - Ribeirão Preto/SP - CEP 14.025-200',
  telefone: '(16) 99757-7587',
  email: 'suporte@cvfmedical.com.br',
};

// Missão, visão e valores - exibidos na capa do relatório final enviado
// ao cliente (Registro de Entrada + OS + Orçamento).
export const MISSAO_VISAO_VALORES: { rotulo: string; texto: string }[] = [
  {
    rotulo: 'Missão',
    texto:
      'Garantir a segurança e o desempenho de equipamentos médico-cirúrgicos por meio de manutenção especializada, rastreável e em conformidade com as normas técnicas, prolongando a vida útil dos instrumentos e apoiando a qualidade do atendimento ao paciente.',
  },
  {
    rotulo: 'Visão',
    texto:
      'Ser referência nacional em manutenção e recuperação de endoscópios e instrumentais cirúrgicos, reconhecida pela excelência técnica, pela confiabilidade dos laudos e pelo compromisso com a conformidade regulatória.',
  },
  {
    rotulo: 'Valores',
    texto:
      'Segurança do paciente acima de tudo · Qualidade e conformidade técnica (ISO 8600) · Rastreabilidade e transparência · Ética e compromisso com o cliente · Melhoria contínua · Responsabilidade e pontualidade.',
  },
];

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
