// Notifica a CVF por e-mail quando o CLIENTE faz uma ação no portal (aprovar/
// recusar orçamento, confirmar termo de entrega). Serve de registro documental.
// O destinatário é FIXO (a própria CVF) - o cliente autenticado só dispara o
// texto, nunca escolhe para quem vai, então não há como abusar para spam.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Não autenticado' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const remetente = Deno.env.get('RESEND_FROM') ?? 'Q-CVF Medical <onboarding@resend.dev>';
  // Destinatário fixo das notificações (a própria CVF). Pode ser sobreposto por env.
  const destino = Deno.env.get('RESEND_TO_NOTIF') ?? 'cvfmedical@cvfmedical.com.br';

  if (!resendApiKey) return json({ error: 'RESEND_API_KEY não configurada.' }, 500);

  // Exige apenas um usuário autenticado (cliente do portal ou staff).
  const supabaseCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabaseCaller.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Não autenticado' }, 401);

  let corpo: { assunto?: string; html?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!corpo.assunto || !corpo.html) return json({ error: 'Assunto e conteúdo são obrigatórios.' }, 400);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remetente,
      to: destino,
      subject: corpo.assunto,
      html: corpo.html,
    }),
  });
  const resultado = await resp.json().catch(() => ({}));
  if (!resp.ok) return json({ error: 'Falha no Resend', detalhe: resultado }, 502);
  return json({ ok: true, id: resultado.id ?? null });
});
