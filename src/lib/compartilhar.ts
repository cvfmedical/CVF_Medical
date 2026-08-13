// Links simples de compartilhamento (sem API/credenciais): abrem o
// WhatsApp Web/app ou o cliente de e-mail já com o texto preenchido -
// quem manda de fato é o usuário, revisando antes de enviar.

// URL do portal do cliente (prototipo estatico em portal_cliente/index.html).
// Enquanto não houver hospedagem publica configurada, isso aponta para um
// placeholder - trocar aqui assim que o deploy existir.
export const PORTAL_CLIENTE_URL = import.meta.env.VITE_PORTAL_CLIENTE_URL || 'https://portal.cvfmedical.com.br';

function somenteDigitosTelefone(telefone: string | null | undefined): string {
  return (telefone ?? '').replace(/\D/g, '');
}

export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string {
  const numero = somenteDigitosTelefone(telefone);
  const comCodigoPais = numero.startsWith('55') ? numero : `55${numero}`;
  return `https://wa.me/${comCodigoPais}?text=${encodeURIComponent(mensagem)}`;
}

// Abre o Gmail (compose web) já com destinatário/assunto/corpo preenchidos.
// Usamos o Gmail em vez de mailto: porque mailto depende do app de e-mail
// padrão do sistema (que às vezes não está configurado e abre em branco).
// Obs.: nem o Gmail nem o mailto conseguem ANEXAR arquivos por link - o
// usuário anexa os PDFs na mão (ou usa o portal, que já entrega os arquivos).
export function linkEmail(email: string | null | undefined, assunto: string, corpo: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: email ?? '',
    su: assunto,
    body: corpo,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
