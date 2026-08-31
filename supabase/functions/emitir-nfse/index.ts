// Emite (e consulta) NFS-e Nacional via Focus NFe, pra CVF Medical não
// precisar mais digitar número/série/chave à mão em Faturamento depois de
// emitir em outro sistema (Nota Control). Mesmo esqueleto de auth de
// enviar-orcamento/index.ts: valida o Authorization, confere que quem
// chamou é funcionário ativo via service_role (a service_role key nunca
// sai do servidor).
//
// Dados fiscais fixos da CVF Medical (Ribeirão Preto/SP, Simples
// Nacional) - vêm do Nota Control (sistema já em uso) e não devem mudar
// com frequência. Se mudarem, é só ajustar aqui.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CNPJ_PRESTADOR = '46948692000103';
const INSCRICAO_MUNICIPAL_PRESTADOR = '20147606'; // confirmado no Nota Control/contador
const CODIGO_MUNICIPIO_RIBEIRAO_PRETO = 3543402; // IBGE - serviço sempre prestado na oficina da CVF
const CODIGO_TRIBUTACAO_NACIONAL_ISS = '140201'; // Assistência técnica (confirmado no Nota Control)
const TIPO_RETENCAO_ISS = 1; // tpRetISSQN: 1 = Não Retido (confirmado no Nota Control)

// Grupo IBS/CBS (Reforma Tributária, obrigatório na NFS-e nacional desde
// 01/07/2026) - nomes de campo confirmados pelo suporte da Focus NFe e
// pela documentação oficial (campos.focusnfe.com.br/nfse_nacional) em
// 31/08/2026: são campos soltos no nível raiz do payload, sem grupo
// aninhado. As ALÍQUOTAS (IBS/CBS) não são enviadas pelo emissor - são
// calculadas automaticamente pela plataforma Sefin Nacional a partir de
// CST + cClassTrib + localidade.
const CODIGO_INDICADOR_OPERACAO = '050101'; // cIndOp - confirmado no Nota Control
const CST_IBS_CBS = '000'; // CST - "Tributação integral" (confirmado no Nota Control)
const CLASSIFICACAO_TRIBUTARIA_IBS_CBS = '000001'; // cClassTrib - "Situações tributadas integralmente" (confirmado no Nota Control)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function apenasDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

// dd/MM/yyyy-like ISO com offset de São Paulo (-03:00), formato exigido
// pela Focus NFe (ex.: "2026-01-01T07:30:00-0300").
function dataEmissaoISO(): string {
  const agora = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}` +
    `T${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}-0300`
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Não autenticado' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const focusToken = Deno.env.get('FOCUS_NFE_TOKEN');
  // Aponta pra homologação por padrão - trocar pra
  // "https://api.focusnfe.com.br" (com um token de produção) só depois de
  // validar a emissão de teste.
  const focusBaseUrl = Deno.env.get('FOCUS_NFE_BASE_URL') ?? 'https://homologacao.focusnfe.com.br';

  if (!focusToken) return json({ error: 'FOCUS_NFE_TOKEN não configurado no servidor.' }, 500);

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
  if (!chamador) return json({ error: 'Só funcionários podem emitir NFS-e.' }, 403);

  let corpo: { contaId?: number; acao?: 'emitir' | 'consultar' };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  const contaId = corpo.contaId;
  const acao = corpo.acao ?? 'emitir';
  if (!contaId) return json({ error: 'contaId é obrigatório.' }, 400);

  const authFocus = 'Basic ' + btoa(`${focusToken}:`);

  if (acao === 'consultar') {
    const { data: conta, error: erroConta } = await supabaseAdmin
      .from('contas_receber')
      .select('id, nfse_ref')
      .eq('id', contaId)
      .single();
    if (erroConta || !conta) return json({ error: 'Conta a receber não encontrada.' }, 404);
    if (!conta.nfse_ref) return json({ error: 'Essa conta ainda não teve NFS-e emitida por aqui.' }, 400);

    const resp = await fetch(`${focusBaseUrl}/v2/nfsen/${conta.nfse_ref}`, {
      headers: { Authorization: authFocus },
    });
    const resultado = await resp.json().catch(() => ({}));

    if (resultado.status === 'autorizado') {
      await supabaseAdmin
        .from('contas_receber')
        .update({
          nf_tipo: 'NFS-e',
          nf_numero: resultado.numero ?? null,
          nf_chave_acesso: resultado.codigo_verificacao ?? null,
          nf_data_emissao: resultado.data_emissao ? String(resultado.data_emissao).slice(0, 10) : null,
          nfse_status: 'autorizada',
          nfse_pdf_path: resultado.url_danfse ?? null,
          nfse_erro_detalhe: null,
        })
        .eq('id', contaId);
    } else if (resultado.status === 'erro_autorizacao' || resultado.status === 'negado') {
      const detalhe = Array.isArray(resultado.erros)
        ? resultado.erros.map((e: { mensagem?: string }) => e.mensagem).join('; ')
        : JSON.stringify(resultado);
      await supabaseAdmin
        .from('contas_receber')
        .update({ nfse_status: 'erro', nfse_erro_detalhe: detalhe })
        .eq('id', contaId);
    } else if (resultado.status === 'cancelado') {
      await supabaseAdmin.from('contas_receber').update({ nfse_status: 'cancelada' }).eq('id', contaId);
    }

    return json({ ok: true, resultado });
  }

  // acao === 'emitir'
  const { data: conta, error: erroConta } = await supabaseAdmin
    .from('contas_receber')
    .select(
      'id, valor, nf_numero, cliente_id, descricao, orcamentos(numero_orcamento, ordem_servico_id, ordens_servico(numero_os))',
    )
    .eq('id', contaId)
    .single();
  if (erroConta || !conta) return json({ error: 'Conta a receber não encontrada.' }, 404);
  if (conta.nf_numero) return json({ error: 'Essa conta já tem NF lançada.' }, 400);
  if (!conta.valor || conta.valor <= 0) return json({ error: 'Valor da conta precisa ser maior que zero.' }, 400);

  const { data: cliente, error: erroCliente } = await supabaseAdmin
    .from('clientes')
    .select('cnpj, razao_social')
    .eq('id', conta.cliente_id)
    .single();
  if (erroCliente || !cliente) return json({ error: 'Cliente da conta não encontrado.' }, 404);

  const documentoTomador = apenasDigitos(cliente.cnpj);
  if (documentoTomador.length !== 14 && documentoTomador.length !== 11) {
    return json({ error: 'CNPJ/CPF do cliente inválido ou não cadastrado - corrija em Cadastros → Clientes.' }, 400);
  }
  if (!cliente.razao_social) {
    return json({ error: 'Razão social do cliente não cadastrada - corrija em Cadastros → Clientes.' }, 400);
  }

  const orc = (conta as unknown as { orcamentos: { numero_orcamento: string; ordens_servico: { numero_os: string } | null } | null }).orcamentos;
  const descricaoServico = orc
    ? `Prestação de serviço de manutenção em equipamento cirúrgico - Orçamento ${orc.numero_orcamento}${orc.ordens_servico ? ' - OS ' + orc.ordens_servico.numero_os : ''}`
    : conta.descricao || 'Prestação de serviço de manutenção em equipamento cirúrgico';

  const ref = `qcvf-cr-${conta.id}`;
  const payload = {
    data_emissao: dataEmissaoISO(),
    serie_dps: 1,
    numero_dps: conta.id,
    data_competencia: dataEmissaoISO().slice(0, 10),
    emitente_dps: 1,
    codigo_municipio_emissora: CODIGO_MUNICIPIO_RIBEIRAO_PRETO,
    cnpj_prestador: CNPJ_PRESTADOR,
    inscricao_municipal_prestador: INSCRICAO_MUNICIPAL_PRESTADOR,
    codigo_opcao_simples_nacional: 1,
    regime_especial_tributacao: 0,
    ...(documentoTomador.length === 14 ? { cnpj_tomador: documentoTomador } : { cpf_tomador: documentoTomador }),
    razao_social_tomador: cliente.razao_social,
    codigo_municipio_prestacao: CODIGO_MUNICIPIO_RIBEIRAO_PRETO,
    codigo_tributacao_nacional_iss: CODIGO_TRIBUTACAO_NACIONAL_ISS,
    descricao_servico: descricaoServico,
    valor_servico: conta.valor,
    tributacao_iss: 1,
    tipo_retencao_iss: TIPO_RETENCAO_ISS,
    // Grupo IBS/CBS (Reforma Tributária) - ver constantes no topo do arquivo.
    finalidade_emissao: 0,
    consumidor_final: 0,
    indicador_destinatario: 0,
    codigo_indicador_operacao: CODIGO_INDICADOR_OPERACAO,
    ibs_cbs_situacao_tributaria: CST_IBS_CBS,
    ibs_cbs_classificacao_tributaria: CLASSIFICACAO_TRIBUTARIA_IBS_CBS,
  };

  const resp = await fetch(`${focusBaseUrl}/v2/nfsen?ref=${encodeURIComponent(ref)}`, {
    method: 'POST',
    headers: { Authorization: authFocus, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const resultado = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    await supabaseAdmin
      .from('contas_receber')
      .update({ nfse_status: 'erro', nfse_erro_detalhe: resultado.mensagem ?? JSON.stringify(resultado) })
      .eq('id', contaId);
    return json({ error: 'Falha ao emitir NFS-e', detalhe: resultado }, 502);
  }

  await supabaseAdmin
    .from('contas_receber')
    .update({ nfse_status: 'processando', nfse_ref: ref, nfse_erro_detalhe: null })
    .eq('id', contaId);

  return json({ ok: true, ref, resultado });
});
