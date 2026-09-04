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

// supabase.functions.invoke() joga um FunctionsHttpError genérico
// ("Edge Function returned a non-2xx status code") sempre que a function
// responde com status != 2xx - a mensagem específica que a function
// devolveu (ex.: "Endereço do cliente incompleto...") fica só no corpo da
// Response, em error.context, e nunca chega em error.message. Sem isso,
// toda validação da function (400/404/500) aparecia pro usuário só como
// esse texto genérico, escondendo o motivo real - descoberto ao testar a
// emissão de NFS-e em produção (2026-09-04).
export async function mensagemErroFuncao(error: unknown): Promise<string> {
  const contexto = (error as { context?: unknown } | null)?.context;
  if (contexto && typeof (contexto as Response).json === 'function') {
    try {
      const corpo = await (contexto as Response).clone().json();
      if (corpo?.error) {
        return typeof corpo.error === 'string' ? corpo.error : JSON.stringify(corpo.error);
      }
    } catch {
      // corpo não era JSON (ou já tinha sido consumido) - cai no fallback abaixo.
    }
  }
  return mensagemErro(error);
}
