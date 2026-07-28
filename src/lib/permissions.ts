// Espelho literal de CATEGORIA_PERMISSOES em main_dashboard.py (linhas 77-87)
// e de tem_permissao_staff() em 006_funcionarios_auth.sql. As 3 cópias
// (Python, SQL, TS) precisam ficar em sincronia manual - ver notas do
// plano de migração (proud-wobbling-castle.md).
export const CATEGORIA_PERMISSOES = {
  cadastros_gerais: ['Técnico de Laboratório', 'Recepção', 'Comercial', 'Financeiro'],
  funcionarios: [] as string[],
  catalogo_precos: ['Financeiro'],
  recepcao_os: ['Técnico de Laboratório', 'Recepção'],
  laboratorio_qualidade: ['Técnico de Laboratório'],
  estoque_suprimentos: ['Técnico de Laboratório'],
  comercial: ['Comercial'],
  financeiro: ['Financeiro'],
  sistema: [] as string[],
} as const;

export type Categoria = keyof typeof CATEGORIA_PERMISSOES;

export const NIVEIS_ACESSO = [
  'Administrador',
  'Técnico de Laboratório',
  'Recepção',
  'Comercial',
  'Financeiro',
] as const;

export type NivelAcesso = (typeof NIVEIS_ACESSO)[number];

export function temPermissao(nivelAcesso: string | undefined | null, categoria: Categoria): boolean {
  if (!nivelAcesso) return false;
  if (nivelAcesso === 'Administrador') return true;
  return (CATEGORIA_PERMISSOES[categoria] as readonly string[]).includes(nivelAcesso);
}
