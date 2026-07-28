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
    ],
  },
  {
    titulo: 'Recepção & OS',
    icone: IconClipboardList,
    itens: [
      { label: 'Entrada do equipamento', path: '/entrada-equipamento', categoria: 'recepcao_os', implementado: false },
      { label: 'Abrir nova OS', path: '/ordens-servico/nova', categoria: 'recepcao_os', implementado: false },
      { label: 'Fila de triagem', path: '/fila-triagem', categoria: 'recepcao_os', implementado: false },
      { label: 'Histórico de equipamentos', path: '/historico-equipamentos', categoria: 'recepcao_os', implementado: false },
      { label: 'Entrega ao cliente', path: '/entrega', categoria: 'recepcao_os', implementado: false },
    ],
  },
  {
    titulo: 'Laboratório & qualidade',
    icone: IconMicroscope,
    itens: [
      { label: 'Bancada de visão (ISO 8600)', path: '/bancada-visao', categoria: 'laboratorio_qualidade', implementado: false },
      { label: 'Emissão de laudos PDF', path: '/laudos', categoria: 'laboratorio_qualidade', implementado: false },
      { label: 'Calibração de padrões (17025)', path: '/padroes-calibracao', categoria: 'laboratorio_qualidade', implementado: false },
      { label: 'Montar orçamento (técnico)', path: '/orcamento-tecnico', categoria: 'laboratorio_qualidade', implementado: false },
      { label: 'Manutenção / remontagem', path: '/manutencao', categoria: 'laboratorio_qualidade', implementado: false },
      { label: 'Selagem', path: '/selagem', categoria: 'laboratorio_qualidade', implementado: false },
      { label: 'Teste de estanqueidade', path: '/teste-estanqueidade', categoria: 'laboratorio_qualidade', implementado: false },
      { label: 'Teste de autoclave', path: '/teste-autoclave', categoria: 'laboratorio_qualidade', implementado: false },
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
      { label: 'Contas a pagar / receber', path: '/financeiro/contas', categoria: 'financeiro', implementado: false },
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
