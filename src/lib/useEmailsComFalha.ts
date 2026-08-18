import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

export interface EmailComFalha {
  id: number;
  destinatarios: string[];
  assunto: string;
  orcamento_ids: number[];
  status: string;
  detalhe: string | null;
  criado_em: string;
}

// E-mails que o Resend confirmou terem falhado (bounced) ou gerado
// reclamação (complained) - status que só chega depois, via webhook, então
// esta lista muda sem o usuário ter feito nada na hora do envio (por isso
// vira um alerta flutuante, não só um badge na tela de origem).
export function useEmailsComFalha(enabled = true) {
  return useQuery({
    queryKey: ['emails-com-falha'],
    refetchInterval: 60_000,
    enabled,
    queryFn: async (): Promise<EmailComFalha[]> => {
      const { data, error } = await supabase
        .from('emails_enviados')
        .select('id, destinatarios, assunto, orcamento_ids, status, detalhe, criado_em')
        .in('status', ['bounced', 'reclamado'])
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return data as EmailComFalha[];
    },
  });
}
