// Convida um cliente para o portal (Supabase Auth) e vincula o
// auth_user_id retornado - mesmo padrão de convidar-funcionario, mas
// para clientes.auth_user_id (003_portal_cliente_seguranca.sql). Só
// quem chama autenticado como Administrador pode disparar o convite;
// o service_role key nunca sai do servidor.
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
    return new Response(JSON.stringify({ error: 'Só administradores podem convidar clientes para o portal.' }), {
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
  if (cliente.auth_user_id) {
    return new Response(JSON.stringify({ error: 'Este cliente já tem acesso ao portal.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: convite, error: conviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(cliente.email);
  if (conviteError || !convite.user) {
    return new Response(JSON.stringify({ error: conviteError?.message ?? 'Erro ao enviar convite.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await supabaseAdmin.from('clientes').update({ auth_user_id: convite.user.id }).eq('id', clienteId);

  return new Response(JSON.stringify({ ok: true, auth_user_id: convite.user.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
