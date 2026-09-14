// Recebe o aviso de pagamento da Sicoob (Cobrança Bancária, webhook
// codigoTipoMovimento=7 "Pagamento (Baixa operacional)") e marca a conta
// como Recebida. Endpoint PÚBLICO - a Sicoob não manda JWT do Supabase, e
// ao contrário do Resend (que assina com Svix, ver resend-webhook), a
// documentação pública da Sicoob não especifica nenhuma assinatura ou
// segredo pra verificar a autenticidade do payload que ela envia aqui.
//
// Por segurança, o CONTEÚDO do payload recebido NUNCA é usado diretamente
// pra decidir "foi pago" - ao receber qualquer chamada, esta function
// RE-CONSULTA a situação de verdade direto na API da Sicoob (mTLS,
// autenticado com o certificado do cooperado) e só atualiza o banco com
// base no que a própria Sicoob confirma nessa consulta autenticada. Isso
// evita que uma chamada forjada pra essa URL pública marque uma conta
// como paga sem ter sido - o payload recebido só serve pra saber QUAL
// boleto consultar, nunca pra decidir o resultado.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SICOOB_AUTH_URL =
  Deno.env.get('SICOOB_AUTH_URL') ?? 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token';
const SICOOB_BASE_URL = Deno.env.get('SICOOB_BASE_URL') ?? 'https://api.sicoob.com.br/cobranca-bancaria/v3';
const SICOOB_ESCOPOS =
  'boletos_inclusao boletos_consulta boletos_alteracao webhooks_inclusao webhooks_consulta webhooks_alteracao';

// deno-lint-ignore no-explicit-any
async function clienteMtls(): Promise<any> {
  const cert = Deno.env.get('SICOOB_CERT');
  const key = Deno.env.get('SICOOB_CERT_KEY');
  if (!cert || !key) throw new Error('SICOOB_CERT/SICOOB_CERT_KEY não configurados no servidor.');
  // @ts-ignore - Deno.createHttpClient é API não-padrão do runtime Deno
  return Deno.createHttpClient({ cert, key });
}

// deno-lint-ignore no-explicit-any
async function obterToken(client: any): Promise<string> {
  const clientId = Deno.env.get('SICOOB_CLIENT_ID')!;
  const resp = await fetch(SICOOB_AUTH_URL, {
    method: 'POST',
    // @ts-ignore
    client,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, scope: SICOOB_ESCOPOS }),
  });
  const dados = await resp.json();
  if (!resp.ok || !dados.access_token) throw new Error(`Falha ao obter token da Sicoob: ${JSON.stringify(dados)}`);
  return dados.access_token as string;
}

Deno.serve(async (req: Request) => {
  // O mecanismo de validação de URL da Sicoob não é documentado
  // publicamente - responde OK pra GET (validação comum em webhooks de
  // outros provedores) sem exigir nada, só por precaução.
  if (req.method === 'GET') return new Response('ok', { status: 200 });
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // deno-lint-ignore no-explicit-any
  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    // corpo vazio/inválido - registra e responde ok mesmo assim (não
    // queremos que a Sicoob desative o webhook por causa de "erro" aqui).
  }

  // Registra o payload cru recebido, pra investigar o formato real da
  // primeira vez que a Sicoob chamar isso de verdade (nunca documentado
  // publicamente) - sem isso, não teríamos como confirmar os nomes de
  // campo certos.
  await supabaseAdmin.from('sicoob_webhook_log').insert({ payload: corpo }).select().maybeSingle();

  const nossoNumero = String(corpo?.nossoNumero ?? corpo?.numeroTitulo ?? corpo?.resultado?.nossoNumero ?? '').trim();
  const linhaDigitavel = String(corpo?.linhaDigitavel ?? corpo?.resultado?.linhaDigitavel ?? '').trim();
  if (!nossoNumero && !linhaDigitavel) return new Response('ok', { status: 200 });

  let query = supabaseAdmin.from('contas_receber').select('id, boleto_numero').eq('boleto_emitido_via', 'sicoob');
  query = nossoNumero ? query.eq('boleto_numero', nossoNumero) : query.eq('boleto_linha_digitavel', linhaDigitavel);
  const { data: contas } = await query;
  if (!contas || contas.length === 0) return new Response('ok', { status: 200 });

  try {
    const numeroCliente = Deno.env.get('SICOOB_NUMERO_CLIENTE')!;
    const numeroContratoCobranca = Deno.env.get('SICOOB_NUMERO_CONTRATO_COBRANCA');
    const clientId = Deno.env.get('SICOOB_CLIENT_ID')!;
    const client = await clienteMtls();
    const token = await obterToken(client);

    for (const conta of contas) {
      if (!conta.boleto_numero) continue;
      const q = new URLSearchParams({ numeroCliente, codigoModalidade: '1', nossoNumero: conta.boleto_numero });
      if (numeroContratoCobranca) q.set('numeroContratoCobranca', numeroContratoCobranca);
      const resp = await fetch(`${SICOOB_BASE_URL}/boletos?${q.toString()}`, {
        // @ts-ignore
        client,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', client_id: clientId },
      });
      if (!resp.ok) continue;
      const dados = await resp.json();
      const situacao = dados?.resultado?.situacaoBoleto ?? null;
      if (!situacao) continue;
      await supabaseAdmin
        .from('contas_receber')
        .update({
          boleto_situacao: situacao,
          ...(situacao === 'Liquidado'
            ? { status: 'Recebido', data_recebimento: new Date().toISOString().slice(0, 10) }
            : {}),
        })
        .eq('id', conta.id);
    }
  } catch {
    // Falha ao confirmar com a Sicoob - não atualiza nada (por segurança,
    // preferimos não marcar como pago sem confirmação autenticada) e
    // devolve 200 mesmo assim, pra Sicoob não desativar o webhook.
  }

  return new Response('ok', { status: 200 });
});
