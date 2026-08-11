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

// Condições comerciais padrão do orçamento (o financeiro pode editar por
// orçamento; usadas como valor inicial quando o campo está vazio).
export const CONDICOES_COMERCIAIS_PADRAO = {
  validadeProposta: '30 dias após a emissão da proposta.',
  condicoesPagamento: '50% de sinal; 50% em 15 DDL no faturamento.',
  prazoEntrega: '45 dias após a confirmação do recebimento do sinal.',
};

// Garantia institucional da CVF - texto fixo impresso no relatório ao
// cliente. Como a CVF presta manutenção, a garantia é sobre o serviço
// executado e as peças substituídas (não sobre fabricação).
export const GARANTIA_CVF = {
  resumo:
    'A CVF Medical garante os serviços de manutenção executados e as peças substituídas pelo prazo de 90 (noventa) dias, contados a partir da data de entrega do equipamento.',
  intro: 'Para a validade da garantia, são condições indispensáveis:',
  itens: [
    'Que a falha decorra do serviço executado ou de peça substituída pela CVF Medical; falhas de qualquer outra origem não estão incluídas.',
    'Que o equipamento tenha sido utilizado conforme as instruções do fabricante e as recomendações da CVF Medical.',
    'Que sejam respeitadas as condições de uso, limpeza, esterilização e armazenamento indicadas para o equipamento.',
    'Que a CVF Medical seja comunicada de imediato sobre qualquer falha, no prazo máximo de 10 (dez) dias a partir de sua constatação.',
    'A garantia não cobre danos por mau uso, quedas, esterilização inadequada ou reparos por terceiros, nem danos contingentes ou lucros cessantes.',
    'A garantia cobre a substituição das peças e a mão de obra dos técnicos. Custos de transporte e deslocamento não estão incluídos.',
  ],
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
