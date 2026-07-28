import type { Categoria } from './permissions';

export interface ItemMenu {
  label: string;
  path: string;
  categoria: Categoria;
  recuo?: boolean;
  implementado: boolean;
}

export interface CategoriaMenu {
  titulo: string;
  itens: ItemMenu[];
}

// Espelha a árvore de menus de main_dashboard.py (linhas 221-277), na
// mesma ordem e agrupamento, mais as telas novas do fluxo pós-reparo
// (migração 010) dentro de "Laboratório & Qualidade" / "Recepção & OS".
export const MENU: CategoriaMenu[] = [
  {
    titulo: 'Cadastros Gerais',
    itens: [
      { label: 'Clientes / Hospitais', path: '/clientes', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Funcionários / Técnicos', path: '/funcionarios', categoria: 'funcionarios', implementado: false },
      { label: 'Fornecedores', path: '/fornecedores', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Transportadoras', path: '/transportadoras', categoria: 'cadastros_gerais', implementado: false },
      { label: 'Produtos e Serviços', path: '/produtos-servicos', categoria: 'catalogo_precos', implementado: false },
      { label: 'Catálogo de Óticas (Modelos)', path: '/catalogo-oticas', categoria: 'cadastros_gerais', implementado: false },
      { label: '↳ Equipamentos do Cliente', path: '/equipamentos', categoria: 'cadastros_gerais', recuo: true, implementado: false },
    ],
  },
  {
    titulo: 'Recepção & OS',
    itens: [
      { label: 'Entrada do Equipamento', path: '/entrada-equipamento', categoria: 'recepcao_os', implementado: false },
      { label: 'Abrir Nova OS', path: '/ordens-servico/nova', categoria: 'recepcao_os', implementado: false },
      { label: '↳ Fila de Triagem', path: '/fila-triagem', categoria: 'recepcao_os', recuo: true, implementado: false },
      { label: '↳ Histórico de Equipamentos', path: '/historico-equipamentos', categoria: 'recepcao_os', recuo: true, implementado: false },
      { label: '↳ Entrega ao Cliente', path: '/entrega', categoria: 'recepcao_os', recuo: true, implementado: false },
    ],
  },
  {
    titulo: 'Laboratório & Qualidade',
    itens: [
      { label: 'Bancada de Visão (ISO 8600)', path: '/bancada-visao', categoria: 'laboratorio_qualidade', implementado: false },
      { label: '↳ Emissão de Laudos PDF', path: '/laudos', categoria: 'laboratorio_qualidade', recuo: true, implementado: false },
      { label: '↳ Calibração de Padrões (17025)', path: '/padroes-calibracao', categoria: 'laboratorio_qualidade', recuo: true, implementado: false },
      { label: '↳ Montar Orçamento (Técnico)', path: '/orcamento-tecnico', categoria: 'laboratorio_qualidade', recuo: true, implementado: false },
      { label: '↳ Manutenção / Remontagem', path: '/manutencao', categoria: 'laboratorio_qualidade', recuo: true, implementado: false },
      { label: '↳ Selagem', path: '/selagem', categoria: 'laboratorio_qualidade', recuo: true, implementado: false },
      { label: '↳ Teste de Estanqueidade', path: '/teste-estanqueidade', categoria: 'laboratorio_qualidade', recuo: true, implementado: false },
      { label: '↳ Teste de Autoclave', path: '/teste-autoclave', categoria: 'laboratorio_qualidade', recuo: true, implementado: false },
    ],
  },
  {
    titulo: 'Estoque & Suprimentos',
    itens: [
      { label: 'Inventário de Peças', path: '/estoque', categoria: 'estoque_suprimentos', implementado: false },
      { label: '↳ Controle de Lotes/Validade', path: '/estoque/lotes', categoria: 'estoque_suprimentos', recuo: true, implementado: false },
      { label: '↳ Solicitação de Compras', path: '/estoque/compras', categoria: 'estoque_suprimentos', recuo: true, implementado: false },
    ],
  },
  {
    titulo: 'Comercial',
    itens: [
      { label: '↳ Contratos de Manutenção', path: '/comercial/contratos', categoria: 'comercial', implementado: false },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { label: 'Precificar Orçamentos', path: '/orcamento-financeiro', categoria: 'financeiro', implementado: false },
      { label: '↳ Faturamento (NF-e / NFS-e)', path: '/financeiro/faturamento', categoria: 'financeiro', recuo: true, implementado: false },
      { label: '↳ Contas a Pagar / Receber', path: '/financeiro/contas', categoria: 'financeiro', recuo: true, implementado: false },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { label: 'Configurações e Usuários', path: '/sistema/config', categoria: 'sistema', implementado: false },
      { label: 'Acesso Portal do Cliente', path: '/sistema/portal-cliente', categoria: 'sistema', implementado: false },
    ],
  },
];
