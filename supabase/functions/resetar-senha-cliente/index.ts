// Reenvia o e-mail de "redefinir senha" (Supabase Auth) pra um cliente que
// JÁ tem acesso ao portal (auth_user_id preenchido) - diferente de
// convidar-cliente, que só funciona pra quem AINDA não tem conta. Pedido
// real do usuário (2026-09-17): cliente com acesso já criado esqueceu a
// senha e precisa de um novo link pra definir uma nova, sem que ninguém da
// CVF veja ou digite a senha - o Supabase manda o e-mail direto pro
// cliente, com um link que só ele consegue usar.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Não autenticado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabaseCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabaseCaller.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Não autenticado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // service_role bypassa RLS - só é usado depois de confirmar acima que
  // quem chamou é um Administrador de verdade.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: chamador } = await supabaseAdmin
    .from('funcionarios')
    .select('nivel_acesso')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();

  if (!chamador || chamador.nivel_acesso !== 'Administrador') {
    return new Response(JSON.stringify({ error: 'Só administradores podem resetar a senha de clientes.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { cliente_id?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corpo da requisição inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clienteId = body.cliente_id;
  if (!clienteId) {
    return new Response(JSON.stringify({ error: 'cliente_id é obrigatório.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: cliente, error: clienteError } = await supabaseAdmin
    .from('clientes')
    .select('id, razao_social, email, auth_user_id')
    .eq('id', clienteId)
    .single();

  if (clienteError || !cliente) {
    return new Response(JSON.stringify({ error: 'Cliente não encontrado.' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!cliente.email) {
    return new Response(JSON.stringify({ error: 'Cliente não tem e-mail cadastrado.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!cliente.auth_user_id) {
    return new Response(
      JSON.stringify({ error: 'Este cliente ainda não tem acesso ao portal - use "Convidar" em vez de resetar senha.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Mesmo redirect do convite - a tela "Definir sua senha" do portal trata
  // tanto o token de convite (type=invite) quanto o de recuperação
  // (type=recovery) vindos do #hash da URL.
  const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(cliente.email, {
    redirectTo: 'https://portal.cvfmedical.com.br',
  });
  if (resetError) {
    return new Response(JSON.stringify({ error: resetError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
