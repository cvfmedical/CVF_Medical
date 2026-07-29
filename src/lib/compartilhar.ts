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

export function linkEmail(email: string | null | undefined, assunto: string, corpo: string): string {
  return `mailto:${email ?? ''}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}
