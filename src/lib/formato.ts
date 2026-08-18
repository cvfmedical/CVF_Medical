// Dados da empresa (usados no cabeçalho/rodapé dos relatórios) e helpers de
// formatação pt-BR (moeda com ponto de milhar e vírgula decimal).

export const EMPRESA = {
  razaoSocial: 'CVF MEDICAL MANUTENÇÃO EM EQUIPAMENTOS CIRÚRGICOS LTDA',
  cnpj: '46.948.692/0001-03',
  endereco: 'Rua Sete de Setembro, 1929 - Ribeirão Preto/SP - CEP 14.025-384',
  telefone: '(16) 99757-7587',
  email: 'cvfmedical@cvfmedical.com.br',
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
  validadeProposta: '10 dias',
  condicoesPagamento: '28 DDL',
};

// Garantia institucional da CVF - texto fixo impresso no relatório ao
// cliente. Como a CVF presta manutenção, a garantia é sobre o serviço
// executado e as peças substituídas (não sobre fabricação).
export const GARANTIA_CVF = {
  resumo:
    'A CVF Medical garante os serviços de manutenção executados e as peças substituídas pelo prazo de 90 (noventa) dias, contados a partir da data de entrega do equipamento.',
  intro: 'Para a validade da garantia, são condições indispensáveis:',
  itens: [
    'Que a falha decorra do serviço executado ou das peças substituídas pela CVF Medical, desde que não se constate mau uso.',
    'Que o equipamento tenha sido utilizado conforme as instruções do fabricante.',
    'Que sejam respeitadas as condições de uso, limpeza, esterilização e armazenamento indicadas para o equipamento.',
    'Que a CVF Medical seja comunicada de imediato sobre qualquer falha, no prazo máximo de 2 (dois) dias a partir do recebimento do equipamento.',
    'A garantia não cobre danos por mau uso, quedas, esterilização inadequada ou reparos por terceiros.',
    'A garantia cobre a substituição das peças e a mão de obra dos técnicos. Custos de transporte e deslocamento não estão incluídos.',
  ],
};

// Condições gerais (confidencialidade/LGPD e responsabilidade) - texto
// institucional fixo impresso na página do Orçamento do relatório ao cliente.
export const CLAUSULAS_GERAIS: { titulo: string; texto: string }[] = [
  {
    titulo: 'Confidencialidade e proteção de dados (LGPD)',
    texto:
      'As partes obrigam-se a manter sigilo sobre as informações a que tiverem acesso em razão deste orçamento e da prestação dos serviços, tratando eventuais dados pessoais em conformidade com a Lei nº 13.709/2018 (LGPD), exclusivamente para as finalidades necessárias à execução do serviço.',
  },
  {
    titulo: 'Limitação de responsabilidade',
    texto:
      'A CONTRATADA não responderá por perdas e danos, lucros cessantes, danos emergentes ou insucessos comerciais advindos de falhas havidas no serviço objeto deste orçamento.',
  },
  {
    titulo: 'Responsabilidade da CONTRATANTE',
    texto:
      'É de total responsabilidade da CONTRATANTE a relação profissional mantida com o profissional habilitado, respondendo por todos os encargos relativos à relação, bem como por toda a responsabilidade civil e criminal por eventuais danos causados a terceiros atendidos nos procedimentos que envolvam o objeto do presente orçamento.',
  },
];

// Checklist fixo de procedimentos padrão de manutenção de óticas, impresso
// no orçamento (entre os itens precificados e as condições comerciais)
// quando o equipamento é uma ótica (entradas_equipamento/ordens_servico.eh_otica).
export const CHECKLIST_OTICA = [
  'Recuperação da estrutura do equipamento: polimento, jateamento e gravação a laser',
  'Limpeza interna',
  'Substituição de Kit de Vedação',
  'Endoscópio hermeticamente selado a laser (quando aplicável)',
  'Teste de estanqueidade',
  'Teste em autoclave',
  'Testes de parâmetros de funcionamento',
];

// Aviso fixo impresso junto do checklist acima.
export const AVISO_MANUTENCAO =
  'Durante o processo de execução da manutenção, caso identificado algum problema no equipamento ou outro defeito, será enviado novo orçamento ou devolução do equipamento sem conserto.';

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

export interface ModeloOticaResumo {
  fabricante: string;
  modelo: string;
  tipo?: string | null;
  diametro_mm?: number | null;
  angulo_graus?: number | null;
}

// "175mm x 4mm x 30° - Artroscopia de joelho/ombro - Karl Storz" - label
// padrão de um modelo do catálogo de óticas, usado em todo combobox/select
// que referencia catalogo_oticas (antes cada tela montava essa string do
// seu próprio jeito, com formatos diferentes entre si).
export function formatarModeloOtica(c: ModeloOticaResumo): string {
  const dimensoes = [c.modelo, c.diametro_mm != null ? `${c.diametro_mm}mm` : null, c.angulo_graus != null ? `${c.angulo_graus}°` : null]
    .filter(Boolean)
    .join(' x ');
  const extra = [c.tipo, c.fabricante].filter(Boolean).join(' - ');
  return extra ? `${dimensoes} - ${extra}` : dimensoes;
}
