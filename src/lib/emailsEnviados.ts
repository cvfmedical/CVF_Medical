import { supabase } from './supabaseClient';

// Registra o envio pra rastrear status de entrega depois (o Resend só
// confirma "aceito para envio" na hora - bounce/reclamação chegam depois
// via webhook do Resend, que atualiza esta mesma linha pelo resend_id).
// Sem o id do Resend não tem o que rastrear, então nesse caso não registra
// nada (não é erro - só significa que esse envio ficará sem rastreio).
export async function registrarEmailEnviado(params: {
  resendId: string | null | undefined;
  destinatarios: string[];
  assunto: string;
  orcamentoIds?: number[];
  entradaId?: number | null;
  enviadoPor?: number | null;
}) {
  if (!params.resendId) return;
  const { error } = await supabase.from('emails_enviados').insert({
    resend_id: params.resendId,
    destinatarios: params.destinatarios,
    assunto: params.assunto,
    orcamento_ids: params.orcamentoIds ?? [],
    entrada_id: params.entradaId ?? null,
    enviado_por: params.enviadoPor ?? null,
  });
  if (error) console.error('Falha ao registrar rastreio de e-mail:', error);
}
