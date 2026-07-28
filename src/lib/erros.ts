// Mapeia erros do Postgres/PostgREST para mensagens amigáveis, no lugar do
// erro cru - equivalente web de ValorDuplicadoError em cadastros.py.
export function mensagemErro(error: unknown): string {
  const e = error as { code?: string; message?: string; details?: string } | null;
  if (!e) return 'Erro desconhecido.';

  if (e.code === '23505') {
    return 'Já existe um registro com este valor único (verifique CNPJ, número de série, login etc).';
  }
  if (e.code === '23503') {
    return 'Não é possível concluir: este registro está referenciado por outro (ex: exclua os vínculos primeiro).';
  }
  if (e.code === '42501' || e.message?.toLowerCase().includes('permission denied')) {
    return 'Seu cargo não tem permissão para esta ação.';
  }
  return e.message ?? 'Erro ao processar a solicitação.';
}
