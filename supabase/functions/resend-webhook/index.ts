// Recebe os eventos de status de entrega do Resend (delivered, bounced,
// complained, delivery_delayed) e atualiza a linha correspondente em
// public.emails_enviados (casada pelo resend_id = data.email_id). Endpoint
// público (o Resend não manda JWT do Supabase) - a autenticidade é
// verificada pela assinatura Svix que o Resend assina com o "Signing
// Secret" configurado no dashboard dele, guardado aqui como o segredo
// RESEND_WEBHOOK_SECRET.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOLERANCIA_TIMESTAMP_SEGUNDOS = 5 * 60;

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesParaBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function assinaturaValida(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  corpo: string,
): Promise<boolean> {
  const timestamp = Number(svixTimestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > TOLERANCIA_TIMESTAMP_SEGUNDOS) {
    return false;
  }

  const partesSecret = secret.split('_');
  const secretBase64 = partesSecret.length > 1 ? partesSecret.slice(1).join('_') : secret;
  const chave = await crypto.subtle.importKey(
    'raw',
    base64ParaBytes(secretBase64),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const conteudoAssinado = `${svixId}.${svixTimestamp}.${corpo}`;
  const buffer = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(conteudoAssinado));
  const assinaturaEsperada = bytesParaBase64(new Uint8Array(buffer));

  const assinaturasRecebidas = svixSignature
    .split(' ')
    .map((parte) => parte.split(',')[1])
    .filter(Boolean);
  return assinaturasRecebidas.includes(assinaturaEsperada);
}

const STATUS_POR_EVENTO: Record<string, string> = {
  'email.delivered': 'entregue',
  'email.bounced': 'bounced',
  'email.complained': 'reclamado',
  'email.delivery_delayed': 'atrasado',
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!secret || !svixId || !svixTimestamp || !svixSignature) {
    return new Response('Não autorizado', { status: 401 });
  }

  const corpoTexto = await req.text();
  const valido = await assinaturaValida(secret, svixId, svixTimestamp, svixSignature, corpoTexto);
  if (!valido) return new Response('Assinatura inválida', { status: 401 });

  let evento: { type?: string; data?: Record<string, unknown> };
  try {
    evento = JSON.parse(corpoTexto);
  } catch {
    return new Response('Corpo inválido', { status: 400 });
  }

  const novoStatus = evento.type ? STATUS_POR_EVENTO[evento.type] : undefined;
  const emailId = evento.data?.email_id as string | undefined;
  if (!novoStatus || !emailId) return new Response('ok', { status: 200 });

  const detalheBruto =
    (evento.data?.bounce as { message?: string } | undefined)?.message ??
    (evento.data?.complaint as { feedback_id?: string } | undefined)?.feedback_id ??
    null;

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await supabaseAdmin
    .from('emails_enviados')
    .update({ status: novoStatus, detalhe: detalheBruto, atualizado_em: new Date().toISOString() })
    .eq('resend_id', emailId);

  return new Response('ok', { status: 200 });
});
