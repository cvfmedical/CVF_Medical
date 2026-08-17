import {
  IconAddressBook,
  IconBriefcase,
  IconClipboardList,
  IconCoin,
  IconMicroscope,
  IconPackage,
  IconSettings,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { Categoria } from './permissions';

export interface ItemMenu {
  label: string;
  path: string;
  categoria: Categoria;
  implementado: boolean;
  // Rota gerada normalmente, mas não listada no menu lateral (telas que
  // só fazem sentido abertas com um parâmetro, ex: /registro-entrada?os=).
  oculto?: boolean;
  // Subtítulo opcional para agrupar itens dentro de uma categoria longa
  // (ex.: "Laboratório & qualidade", que tem muitas telas). Itens sem
  // grupo aparecem soltos no topo da categoria.
  grupo?: string;
}

export interface CategoriaMenu {
  titulo: string;
  icone: Icon;
  itens: ItemMenu[];
}

// Espelha a árvore de menus de main_dashboard.py (linhas 221-277), na
// mesma ordem e agrupamento, mais as telas novas do fluxo pós-reparo
// (migração 010) dentro de "Laboratório & qualidade" / "Recepção & OS".
// Rótulos em sentence case (regra de design: nunca Title Case/CAIXA ALTA,
// exceto siglas como OS/ISO/PDF/CNPJ/NF-e).
export const MENU: CategoriaMenu[] = [
  {
    titulo: 'Cadastros gerais',
    icone: IconAddressBook,
    itens: [
      { label: 'Clientes / hospitais', path: '/clientes', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Funcionários / técnicos', path: '/funcionarios', categoria: 'funcionarios', implementado: false },
      { label: 'Fornecedores', path: '/fornecedores', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Transportadoras', path: '/transportadoras', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Produtos e serviços', path: '/produtos-servicos', categoria: 'catalogo_precos', implementado: false },
      { label: 'Catálogo de óticas (modelos)', path: '/catalogo-oticas', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Equipamentos do cliente', path: '/equipamentos', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Observações de defeito', path: '/observacoes-defeito', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Categorias de produtos/serviços', path: '/categorias-produtos-servicos', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Tipos de ótica', path: '/tipos-otica', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Condições de chegada', path: '/condicoes-chegada', categoria: 'cadastros_gerais', implementado: false },
    ],
  },
  {
    titulo: 'Recepção & OS',
    icone: IconClipboardList,
    itens: [
      { label: 'Entrada do equipamento', path: '/entrada-equipamento', categoria: 'recepcao_os', implementado: false },
      // Rota existe (acessada via "Converter em OS" e pelo botão em Ordens
      // de serviço), mas escondida do menu: aberta em branco não faz nada,
      // pois precisa de uma OS específica (?os=...).
      { label: 'Registro de entrada (revisão)', path: '/registro-entrada', categoria: 'recepcao_os', implementado: false, oculto: true },
      { label: 'Abrir nova OS', path: '/ordens-servico/nova', categoria: 'recepcao_os', implementado: false },
      { label: 'Ordens de serviço', path: '/ordens-servico', categoria: 'recepcao_os', implementado: false },
      { label: 'Entrega ao cliente', path: '/entrega', categoria: 'recepcao_os', implementado: false },
    ],
  },
  {
    titulo: 'Laboratório & qualidade',
    icone: IconMicroscope,
    itens: [
      // Orçamento & reparo
      { label: 'Montar orçamento (técnico)', path: '/orcamento-tecnico', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Orçamento & reparo' },
      { label: 'Orçamentos aprovados', path: '/orcamentos-aprovados', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Orçamento & reparo' },
      { label: 'Manutenção / remontagem', path: '/manutencao', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Orçamento & reparo' },
      // Ensaios ópticos (ISO 8600)
      { label: 'Bancada de visão (ISO 8600)', path: '/bancada-visao', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Ensaios ópticos (ISO 8600)' },
      { label: 'Teste de resolução (ISO 8600-5)', path: '/teste-resolucao', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Ensaios ópticos (ISO 8600)' },
      { label: 'Teste de luz / transmissão', path: '/teste-luz', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Ensaios ópticos (ISO 8600)' },
      { label: 'Medição dimensional (ISO 8600-4)', path: '/medicao-dimensional', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Ensaios ópticos (ISO 8600)' },
      { label: 'Auto-validação do sistema', path: '/auto-validacao', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Ensaios ópticos (ISO 8600)' },
      // Pós-reparo & selagem
      { label: 'Teste de estanqueidade', path: '/teste-estanqueidade', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Pós-reparo & selagem' },
      { label: 'Teste de autoclave', path: '/teste-autoclave', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Pós-reparo & selagem' },
      { label: 'Teste de qualidade / funcionamento', path: '/teste-qualidade', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Pós-reparo & selagem' },
      // Laudos & metrologia
      { label: 'Emissão de laudos PDF', path: '/laudos', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Laudos & metrologia' },
      { label: 'Amostras-padrão (golden sample)', path: '/amostras-padrao', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Laudos & metrologia' },
      { label: 'Calibração de padrões (17025)', path: '/padroes-calibracao', categoria: 'laboratorio_qualidade', implementado: false, grupo: 'Laudos & metrologia' },
    ],
  },
  {
    titulo: 'Estoque & suprimentos',
    icone: IconPackage,
    itens: [
      { label: 'Inventário de peças', path: '/estoque', categoria: 'estoque_suprimentos', implementado: false },
      { label: 'Controle de lotes/validade', path: '/estoque/lotes', categoria: 'estoque_suprimentos', implementado: false },
      { label: 'Solicitação de compras', path: '/estoque/compras', categoria: 'estoque_suprimentos', implementado: false },
    ],
  },
  {
    titulo: 'Comercial',
    icone: IconBriefcase,
    itens: [
      { label: 'Contratos de manutenção', path: '/comercial/contratos', categoria: 'comercial', implementado: false },
    ],
  },
  {
    titulo: 'Financeiro',
    icone: IconCoin,
    itens: [
      { label: 'Precificar orçamentos', path: '/orcamento-financeiro', categoria: 'financeiro', implementado: false },
      { label: 'Faturamento (NF-e / NFS-e)', path: '/financeiro/faturamento', categoria: 'financeiro', implementado: false },
      { label: 'Contas a receber', path: '/financeiro/contas-receber', categoria: 'financeiro', implementado: false },
      { label: 'Contas a pagar', path: '/financeiro/contas-pagar', categoria: 'financeiro', implementado: false },
    ],
  },
  {
    titulo: 'Sistema',
    icone: IconSettings,
    itens: [
      { label: 'Configurações e usuários', path: '/sistema/config', categoria: 'sistema', implementado: false },
      { label: 'Acesso portal do cliente', path: '/sistema/portal-cliente', categoria: 'sistema', implementado: false },
    ],
  },
];

export function categoriaDoPath(path: string): CategoriaMenu | undefined {
  return MENU.find((cat) => cat.itens.some((item) => item.path === path));
}
