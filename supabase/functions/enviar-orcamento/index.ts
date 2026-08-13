// Envia o e-mail do orçamento ao cliente COM os PDFs anexados (Registro de
// Entrada, Ordem de Serviço e Orçamento), usando o Resend. A chave do Resend
// (RESEND_API_KEY) e o remetente (RESEND_FROM) ficam como segredos da função,
// nunca no front. Só quem chama autenticado como staff (funcionário) pode
// disparar; o service_role key nunca sai do servidor.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Anexo {
  filename: string;
  content: string; // PDF em base64 (sem o prefixo data:)
}

interface Corpo {
  to: string;
  subject: string;
  html: string;
  anexos?: Anexo[];
}

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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const remetente = Deno.env.get('RESEND_FROM') ?? 'Q-CVF Medical <onboarding@resend.dev>';

  if (!resendApiKey) return json({ error: 'RESEND_API_KEY não configurada no servidor.' }, 500);

  // Confirma que quem chamou é um funcionário (staff) autenticado.
  const supabaseCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabaseCaller.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Não autenticado' }, 401);

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: chamador } = await supabaseAdmin
    .from('funcionarios')
    .select('id')
    .eq('auth_user_id', userData.user.id)
    .eq('status_ativo', true)
    .maybeSingle();
  if (!chamador) return json({ error: 'Só funcionários podem enviar orçamentos.' }, 403);

  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!corpo.to || !corpo.subject) return json({ error: 'Destinatário e assunto são obrigatórios.' }, 400);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: remetente,
      to: corpo.to,
      subject: corpo.subject,
      html: corpo.html,
      attachments: (corpo.anexos ?? []).map((a) => ({ filename: a.filename, content: a.content })),
    }),
  });

  const resultado = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return json({ error: 'Falha no Resend', detalhe: resultado }, 502);
  }
  return json({ ok: true, id: resultado.id ?? null });
});
