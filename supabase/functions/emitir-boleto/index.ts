// Emissão/consulta de boleto via API de Cobrança Bancária da Sicoob (v3).
// Diferente das outras integrações fiscais (Focus NFe), essa exige
// certificado digital mTLS (ICP Brasil, emitido pro cooperado) em toda
// chamada - não só um Bearer token. Deno.createHttpClient({cert, key})
// funciona de forma confiável aqui no Supabase Edge Functions (testado e
// confirmado - por isso não precisou do Cloudflare Worker cogitado no
// plano original, ver proud-wobbling-castle.md).
//
// Dados de contrato confirmados testando direto contra a Sicoob (não
// adivinhados): numeroCliente precisa incluir o dígito verificador
// concatenado (ex.: "2593831", não "259383-1" nem "259383" sozinho);
// numeroContratoCobranca é obrigatório pra esta conta, apesar da doc da
// Sicoob descrever esse campo como opcional ("só quem tem mais de um
// contrato") - sem ele a consulta falha com "Número de Contrato não
// encontrado ou inválido" (código 5002), mesmo a conta tendo só 1
// contrato. Espécie de documento usada de verdade nos boletos manuais já
// emitidos: "DS" (Duplicata de Serviço) - confirmado num boleto real
// consultado (Cod. Contrato 1313783, NFs 2915-2919).
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

function apenasDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

// yyyy-mm-dd -> dd/mm/yyyy, pro texto de instruções (mesmo formato usado
// nos boletos que o pessoal já lança na mão pelo site do banco).
function dataBR(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Soma dias a uma data no formato yyyy-mm-dd, devolvendo no mesmo formato.
function somarDias(dataIso: string, dias: number): string {
  const d = new Date(dataIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Não existe ambiente de sandbox equivalente pra essa conta/certificado
// real (o "Sandbox" da Sicoob é um ambiente genérico separado, não ligado
// à conta 40.426-8) - por isso aponta direto pra produção, confirmado nos
// dados do aplicativo aprovado no portal developers.sicoob.com.br.
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
  const clientId = Deno.env.get('SICOOB_CLIENT_ID');
  if (!clientId) throw new Error('SICOOB_CLIENT_ID não configurado no servidor.');
  const resp = await fetch(SICOOB_AUTH_URL, {
    method: 'POST',
    // @ts-ignore - "client" é uma extensão não-padrão do fetch do Deno
    client,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, scope: SICOOB_ESCOPOS }),
  });
  const texto = await resp.text();
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error(`Resposta não-JSON da Sicoob ao obter token (status ${resp.status}): ${texto.slice(0, 500)}`);
  }
  if (!resp.ok || !dados.access_token) {
    throw new Error(`Falha ao obter token da Sicoob (status ${resp.status}): ${JSON.stringify(dados)}`);
  }
  return dados.access_token as string;
}

// deno-lint-ignore no-explicit-any
async function chamarSicoob(client: any, token: string, path: string, init: RequestInit = {}): Promise<{ status: number; ok: boolean; dados: any }> {
  const clientId = Deno.env.get('SICOOB_CLIENT_ID')!;
  const resp = await fetch(`${SICOOB_BASE_URL}${path}`, {
    ...init,
    // @ts-ignore
    client,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      client_id: clientId,
    },
  });
  const texto = await resp.text();
  let dados: unknown;
  try {
    dados = texto ? JSON.parse(texto) : {};
  } catch {
    dados = texto;
  }
  return { status: resp.status, ok: resp.ok, dados };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Não autenticado' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabaseCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await supabaseCaller.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Não autenticado' }, 401);

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: chamador } = await supabaseAdmin
    .from('funcionarios')
    .select('id')
    .eq('auth_user_id', userData.user.id)
    .eq('status_ativo', true)
    .maybeSingle();
  if (!chamador) return json({ error: 'Só funcionários podem emitir/consultar boleto.' }, 403);

  let corpo: { acao?: string; contaId?: number; contaIds?: number[]; parametros?: Record<string, string> } = {};
  try {
    corpo = await req.json();
  } catch {
    // corpo vazio é aceitável pra 'testar_conexao'
  }
  const acao = corpo.acao ?? 'testar_conexao';

  const numeroCliente = Deno.env.get('SICOOB_NUMERO_CLIENTE')!;
  const numeroContaCorrente = Deno.env.get('SICOOB_NUMERO_CONTA_CORRENTE')!;
  const numeroContratoCobranca = Deno.env.get('SICOOB_NUMERO_CONTRATO_COBRANCA');
  const CODIGO_MODALIDADE = 1; // Simples com registro - confirmado no boleto real (Modalidade 0001-CREG)
  const ESPECIE_DOCUMENTO = 'DS'; // Duplicata de Serviço - confirmado nos boletos reais já emitidos

  try {
    const client = await clienteMtls();
    const token = await obterToken(client);

    if (acao === 'testar_conexao') {
      return json({ ok: true, mensagem: 'Autenticação mTLS + token OK.' });
    }

    // === Emitir um boleto novo, de verdade, pra uma conta a receber (ou
    // pra VÁRIAS de uma vez, num boleto único somando o valor - ver
    // contaIds) ===
    if (acao === 'incluir') {
      // contaIds (novo, 2026-09-14): junta várias contas do MESMO cliente
      // num boleto SÓ, sem mexer em NF nenhuma - cada conta mantém sua
      // própria NF (se tiver) intacta, só o boleto (boleto_numero/
      // linha_digitavel/etc) é gravado igual em todas. Pedido real: duas
      // contas de "hora técnica" já com NFS-e emitida cada uma (Grupo
      // Cortical, ORC-5584 e ORC-5586), cobradas num boleto único em vez
      // de dois boletos separados.
      const contaIdsBody = Array.isArray(corpo.contaIds) && corpo.contaIds.length > 0 ? corpo.contaIds : null;
      const contaIdUnico = corpo.contaId ?? null;
      if (!contaIdUnico && !contaIdsBody) return json({ error: 'contaId ou contaIds é obrigatório.' }, 400);
      const idsAlvo = contaIdsBody ?? [contaIdUnico!];

      const { data: contasRows, error: contaErro } = await supabaseAdmin
        .from('contas_receber')
        .select('id, numero_conta, valor, data_vencimento, boleto_vencimento, boleto_numero, cliente_id, nf_numero')
        .in('id', idsAlvo);
      if (contaErro || !contasRows || contasRows.length !== idsAlvo.length) {
        return json({ error: 'Conta a receber não encontrada.' }, 404);
      }
      if (contasRows.some((c) => c.boleto_numero)) {
        return json(
          { error: 'Uma ou mais contas selecionadas já têm um boleto lançado. Limpe os campos de boleto antes de emitir um novo.' },
          400,
        );
      }
      const clientesDistintos = new Set(contasRows.map((c) => c.cliente_id));
      if (clientesDistintos.size !== 1) {
        return json({ error: 'Todas as contas precisam ser do mesmo cliente pra emitir um boleto único.' }, 400);
      }
      const clienteIdAlvo = contasRows[0].cliente_id;
      const valorTotal = contasRows.reduce((s, c) => s + Number(c.valor), 0);

      const { data: cliente, error: clienteErro } = await supabaseAdmin
        .from('clientes')
        .select('razao_social, cnpj, logradouro, numero_endereco, bairro, cidade, uf, cep, email')
        .eq('id', clienteIdAlvo)
        .maybeSingle();
      if (clienteErro || !cliente) return json({ error: 'Cliente da conta não encontrado.' }, 404);

      // Vencimento único do boleto - a mais próxima entre as contas
      // selecionadas (nunca atrasa uma cobrança só pra "esperar" a outra).
      const vencimento = contasRows
        .map((c) => c.boleto_vencimento ?? c.data_vencimento)
        .filter((v): v is string => !!v)
        .sort()[0];
      if (!vencimento) return json({ error: 'Nenhuma das contas selecionadas tem data de vencimento definida.' }, 400);
      const dataEncargos = somarDias(vencimento, 1);
      const endereco = `${cliente.logradouro ?? ''}${cliente.numero_endereco ? ', ' + cliente.numero_endereco : ''}`
        .trim()
        .slice(0, 40);
      const numerosNf = contasRows.map((c) => c.nf_numero).filter((v): v is string => !!v);
      // Máx. 18 chars (limite do campo) - com mais de uma conta, usa a
      // primeira + quantas outras entraram junto (ex.: "CR-5599+1").
      const seuNumero = (
        contasRows.length > 1 ? `${contasRows[0].numero_conta}+${contasRows.length - 1}` : String(contasRows[0].numero_conta ?? contasRows[0].id)
      ).slice(0, 18);

      const payload: Record<string, unknown> = {
        numeroCliente: Number(numeroCliente),
        codigoModalidade: CODIGO_MODALIDADE,
        numeroContaCorrente: Number(numeroContaCorrente),
        codigoEspecieDocumento: ESPECIE_DOCUMENTO,
        seuNumero,
        // Documentado como opcional pela Sicoob ("se não informado, usa a
        // data de registro"), mas testado na prática e recusado sem isso
        // ("O campo Data de Emissão deve ter uma data válida.", código
        // 5002). A doc também documenta o formato como
        // "yyyy-mm-ddT00:00:00-03:00", mas isso foi recusado na prática
        // ("O formato da data é inválido.", código 0004) - o formato que
        // funciona é o mesmo yyyy-mm-dd simples usado em dataVencimento/
        // dataMulta/dataJurosMora, sem hora.
        dataEmissao: new Date().toISOString().slice(0, 10),
        identificacaoEmissaoBoleto: 2, // Cliente emite - confirmado no boleto real
        identificacaoDistribuicaoBoleto: 2, // Cliente distribui - confirmado no boleto real
        valor: valorTotal,
        dataVencimento: vencimento,
        tipoDesconto: 0,
        tipoMulta: 2, // Percentual - confirmado no boleto real
        dataMulta: dataEncargos,
        valorMulta: 2,
        tipoJurosMora: 2, // Taxa mensal - confirmado no boleto real
        dataJurosMora: dataEncargos,
        valorJurosMora: 1,
        numeroParcela: 1,
        aceite: false,
        gerarPdf: true,
        // Texto livre do campo "Instruções" do boleto - replica exatamente o
        // padrão já usado nos boletos lançados na mão pelo site do banco
        // (confirmado comparando um boleto real: "A partir DD/MM Juros
        // 0,03%/dia.", "A partir DD/MM Multa de 2%.", "Referente NF XXXX").
        // Sem isso, essa caixa fica em branco no boleto gerado pela API.
        mensagensInstrucao: [
          `A partir ${dataBR(dataEncargos)} Juros 0,03%/dia.`,
          `A partir ${dataBR(dataEncargos)} Multa de 2%.`,
          ...(numerosNf.length > 0 ? [`Referente NF ${numerosNf.join(', ')}`] : []),
        ],
        pagador: {
          numeroCpfCnpj: apenasDigitos(cliente.cnpj),
          nome: (cliente.razao_social ?? '').slice(0, 50),
          endereco: endereco || 'NAO INFORMADO',
          bairro: (cliente.bairro ?? '').slice(0, 30) || 'NAO INFORMADO',
          cidade: (cliente.cidade ?? '').slice(0, 40) || 'NAO INFORMADO',
          cep: apenasDigitos(cliente.cep),
          uf: cliente.uf ?? 'SP',
          ...(cliente.email ? { email: cliente.email } : {}),
        },
      };
      if (numeroContratoCobranca) payload.numeroContratoCobranca = Number(numeroContratoCobranca);

      const { status, ok, dados } = await chamarSicoob(client, token, '/boletos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!ok) {
        return json({ ok: false, status, error: 'Sicoob recusou o boleto.', resultado: dados }, 400);
      }

      // deno-lint-ignore no-explicit-any
      const resultado = (dados as any).resultado ?? dados;

      // Sobe o PDF (base64) pro bucket de documentos financeiros, se veio -
      // mesmo PDF (um boleto só) referenciado em todas as contas envolvidas.
      let pdfPath: string | null = null;
      if (resultado.pdfBoleto) {
        try {
          const bytes = Uint8Array.from(atob(resultado.pdfBoleto), (c) => c.charCodeAt(0));
          pdfPath = `boletos/conta_${idsAlvo.join('-')}_${Date.now()}.pdf`;
          const { error: uploadErro } = await supabaseAdmin.storage
            .from('documentos-financeiro')
            .upload(pdfPath, bytes, { contentType: 'application/pdf' });
          if (uploadErro) pdfPath = null;
        } catch {
          pdfPath = null;
        }
      }

      const { error: updateErro } = await supabaseAdmin
        .from('contas_receber')
        .update({
          boleto_numero: String(resultado.nossoNumero ?? ''),
          boleto_linha_digitavel: resultado.linhaDigitavel ?? null,
          boleto_codigo_barras: resultado.codigoBarras ?? null,
          boleto_vencimento: vencimento,
          boleto_situacao: 'Em Aberto',
          boleto_emitido_via: 'sicoob',
          boleto_pdf_path: pdfPath,
          boleto_registrado_em: new Date().toISOString(),
        })
        .in('id', idsAlvo);
      if (updateErro) return json({ error: `Boleto emitido na Sicoob, mas falhou salvar no sistema: ${updateErro.message}` }, 500);

      return json({
        ok: true,
        contaIds: idsAlvo,
        boletoNumero: resultado.nossoNumero,
        linhaDigitavel: resultado.linhaDigitavel,
        codigoBarras: resultado.codigoBarras,
        pdfPath,
      });
    }

    // === Consultar a situação atual de um boleto já emitido via Sicoob ===
    if (acao === 'consultar') {
      const contaId = corpo.contaId;
      if (!contaId) return json({ error: 'contaId é obrigatório.' }, 400);

      const { data: conta, error: contaErro } = await supabaseAdmin
        .from('contas_receber')
        .select('id, boleto_numero, boleto_emitido_via')
        .eq('id', contaId)
        .maybeSingle();
      if (contaErro || !conta) return json({ error: 'Conta a receber não encontrada.' }, 404);
      if (conta.boleto_emitido_via !== 'sicoob' || !conta.boleto_numero) {
        return json({ error: 'Esta conta não tem um boleto emitido via Sicoob.' }, 400);
      }

      const query = new URLSearchParams({
        numeroCliente,
        codigoModalidade: String(CODIGO_MODALIDADE),
        nossoNumero: conta.boleto_numero,
      });
      if (numeroContratoCobranca) query.set('numeroContratoCobranca', numeroContratoCobranca);

      const { status, ok, dados } = await chamarSicoob(client, token, `/boletos?${query.toString()}`);
      if (!ok) return json({ ok: false, status, error: 'Falha ao consultar na Sicoob.', resultado: dados }, 400);

      // deno-lint-ignore no-explicit-any
      const resultado = (dados as any).resultado ?? dados;
      const situacao = resultado.situacaoBoleto ?? null;
      if (situacao) {
        // Por boleto_numero, não só pelo id consultado - um boleto pode
        // cobrir várias contas juntas (ver ação 'incluir' com contaIds);
        // consultar qualquer uma delas atualiza todas as que compartilham
        // esse mesmo boleto.
        await supabaseAdmin
          .from('contas_receber')
          .update({
            boleto_situacao: situacao,
            ...(situacao === 'Liquidado' ? { status: 'Recebido', data_recebimento: new Date().toISOString().slice(0, 10) } : {}),
          })
          .eq('boleto_numero', conta.boleto_numero);
      }
      return json({ ok: true, situacaoBoleto: situacao, resultado });
    }

    // === Cadastra o webhook de baixa automática (rodar uma vez só) ===
    if (acao === 'cadastrar_webhook') {
      // URL pública e fixa desta mesma instância Supabase - não é
      // sensível (não precisa de secret), é só a identidade do projeto.
      const url = 'https://wrpylwtamxmaclyqdqmg.supabase.co/functions/v1/sicoob-webhook';
      const { status, ok, dados } = await chamarSicoob(client, token, '/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // codigoTipoMovimento 7 = "Pagamento (Baixa operacional)";
        // codigoPeriodoMovimento 1 = "Movimento atual (D0)".
        body: JSON.stringify({ url, codigoTipoMovimento: 7, codigoPeriodoMovimento: 1 }),
      });
      return json({ ok, status, resultado: dados });
    }

    // === Lista os webhooks já cadastrados (confirmar situação/validação) ===
    if (acao === 'listar_webhooks') {
      const { status, ok, dados } = await chamarSicoob(client, token, '/webhooks');
      return json({ ok, status, resultado: dados });
    }

    return json({ error: `Ação desconhecida: ${acao}` }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
