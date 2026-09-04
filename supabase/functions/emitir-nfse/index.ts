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
// Em Ribeirão Preto, o código de tributação MUNICIPAL do ISSQN (cTribMun)
// é igual ao nacional - confirmado lendo o XML de uma NFS-e real já
// autorizada pela prefeitura (nº 2902, emitida pelo Nota Control):
// <cTribMun>140201</cTribMun>, mesmo valor de <cTribNac>. Sem essa nota
// real como referência, o valor não deveria ser adivinhado (a
// documentação da Focus NFe não deixa claro que os dois coincidem aqui).
const CODIGO_TRIBUTACAO_MUNICIPAL_ISS = '140201';
const CODIGO_NBS = '120018200'; // Serviços de manutenção/reparação de instrumentos médico-hospitalares (confirmado no Nota Control e com o contador)
const TIPO_RETENCAO_ISS = 1; // tpRetISSQN: 1 = Não Retido (confirmado no Nota Control)
// Série da DPS pra emissão via API/webservice em PRODUÇÃO - CONFIRMADA
// pela Nota Control/ISSNet por escrito (e-mail de liberação de produção,
// chamado 0550600, 2026-09-02): "Série do documento (DPS): 1". A 70002
// vista no XML real da nota nº 2902 é a série usada pelo canal Web do
// Nota Control (emissão manual pelo portal) - CANAL DIFERENTE do nosso
// (aplicativo próprio/API), cada um com sua própria série. Não confundir
// os dois: 70002 nunca foi a série certa pra emissão via API.
const SERIE_DPS_PRODUCAO = 1;
// O ambiente de HOMOLOGAÇÃO usa um cadastro de contribuinte separado
// (autocadastro no sandbox da ISS.net, não o cadastro real da prefeitura)
// - por isso tem sua PRÓPRIA série, diferente da de produção. CONFIRMADO
// pelo suporte da Focus NFe (2026-09-02, Vitor Gabriel Oliveira): uma
// emissão anterior foi autorizada em homologação usando série 8. Ajustável
// sem redeploy via env FOCUS_NFE_SERIE_DPS_HOMOLOGACAO se precisar trocar
// de novo.
const SERIE_DPS_HOMOLOGACAO = Deno.env.get('FOCUS_NFE_SERIE_DPS_HOMOLOGACAO') ?? '8';
// opSimpNac: 3 = "Optante - Microempresa ou Empresa de Pequeno Porte
// (ME/EPP)" - confirmado na mesma nota real (<opSimpNac>3</opSimpNac>).
// ATENÇÃO: estava com "1" (Não Optante) até 2026-09-01 - valor errado,
// nunca detectado nos testes porque a Focus não valida isso contra a
// Receita em homologação. Corrigido antes de ir pra produção.
const CODIGO_OPCAO_SIMPLES_NACIONAL = 3;
// regApTribSN: 1 = "Regime de apuração dos tributos federais e
// municipal pelo SN" - confirmado na mesma nota real.
const REGIME_TRIBUTARIO_SIMPLES_NACIONAL = 1;

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

function normalizarNomeCidade(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Resolve o código IBGE de 7 dígitos do município a partir do nome da
// cidade + UF - o cadastro de clientes só guarda o nome (texto livre),
// mas o schema da NFS-e (codigo_municipio_tomador) exige o código IBGE.
// Consulta pública do IBGE, sem chave/autenticação. Se falhar por
// qualquer motivo (cidade não localizada, API fora do ar), retorna null
// e o campo simplesmente fica de fora do payload - nunca inventa um
// código.
async function codigoIbgeMunicipio(cidade: string | null, uf: string | null): Promise<number | null> {
  if (!cidade || !uf) return null;
  try {
    const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
    if (!resp.ok) return null;
    const municipios = (await resp.json()) as { id: number; nome: string }[];
    const alvo = normalizarNomeCidade(cidade);
    const achado = municipios.find((m) => normalizarNomeCidade(m.nome) === alvo);
    return achado?.id ?? null;
  } catch {
    return null;
  }
}

// dd/MM/yyyy-like ISO com offset de São Paulo (-03:00), formato exigido
// pela Focus NFe (ex.: "2026-01-01T07:30:00-0300").
//
// BUG REAL corrigido em 2026-09-02: a versão anterior usava
// agora.getHours()/getMinutes()/getSeconds(), que são os componentes de
// horário LOCAL DO SERVIDOR - no Supabase Edge Functions (Deno Deploy) o
// servidor roda em UTC, não em horário de Brasília. Isso fazia o código
// pegar a hora UTC e simplesmente colar "-0300" no final, sem de fato
// SUBTRAIR 3 horas - ou seja, a data/hora declarada ficava ~3h à FRENTE
// do instante real (ex.: 20:17 UTC virava "20:17:00-0300", que na
// verdade corresponde a 23:17 UTC). Achado porque a Focus rejeitou uma
// emissão de teste com "A data e hora de emissão da DPS deve ser
// anterior ou igual à data atual" mesmo enviada na hora - o teste com
// série 8 (2026-09-02) expôs esse bug, que afetaria toda emissão, tanto
// em homologação quanto em produção. Corrigido usando Intl.DateTimeFormat
// com timeZone explícito, que calcula certo independente do fuso do
// servidor.
function dataEmissaoISO(): string {
  const formatador = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const partes = Object.fromEntries(formatador.formatToParts(new Date()).map((p) => [p.type, p.value]));
  // Intl às vezes devolve "24" pra meia-noite em vez de "00" (quirk
  // conhecido do hour12:false em alguns runtimes) - normaliza.
  const hora = partes.hour === '24' ? '00' : partes.hour;
  return `${partes.year}-${partes.month}-${partes.day}T${hora}:${partes.minute}:${partes.second}-0300`;
}

// Mesmo algoritmo de gerarNumeroSequencial (src/lib/numeroSequencial.ts):
// maior sufixo numérico existente + 1, sequência própria por prefixo
// começando em 5500. Precisa estar duplicado aqui porque a edge function
// (Deno) não importa código do app React - usado quando "Emitir NFS-e" é
// clicado direto num orçamento "Liberado" que ainda não tem conta a
// receber (a conta nasce agora, junto com a emissão, em vez de exigir
// que alguém "Lance NF" manualmente antes só pra criar o registro).
async function proximoNumeroConta(
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<string> {
  const { data, error } = await supabaseAdmin.from('contas_receber').select('numero_conta').like('numero_conta', 'CR-%');
  if (error) throw error;
  let maior = 5499;
  for (const row of (data ?? []) as { numero_conta: string | null }[]) {
    const sufixo = (row.numero_conta ?? '').slice(3);
    if (/^\d+$/.test(sufixo)) {
      const n = parseInt(sufixo, 10);
      if (n > maior) maior = n;
    }
  }
  return `CR-${maior + 1}`;
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
  const ambiente: 'homologacao' | 'producao' = focusBaseUrl.includes('homologacao') ? 'homologacao' : 'producao';
  const serieDps = ambiente === 'homologacao' ? Number(SERIE_DPS_HOMOLOGACAO) : SERIE_DPS_PRODUCAO;

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

  type Overrides = Partial<{
    razao_social_tomador: string;
    documento_tomador: string;
    logradouro_tomador: string;
    numero_tomador: string;
    complemento_tomador: string;
    bairro_tomador: string;
    cep_tomador: string;
    cidade_tomador: string;
    uf_tomador: string;
    telefone_tomador: string;
    email_tomador: string;
    descricao_servico: string;
  }>;
  let corpo: {
    contaId?: number;
    orcamentoId?: number;
    acao?: 'emitir' | 'consultar' | 'previsualizar';
    overrides?: Overrides;
  };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  // contaId: conta a receber já existente (fluxo antigo - "Lançar NF"
  // manual já criou a conta, ou é um lançamento avulso/parcelado).
  // orcamentoId: orçamento "Liberado" que AINDA não tem conta - usado
  // quando "Emitir NFS-e" é clicado direto no orçamento; a conta é criada
  // agora, dentro da ação 'emitir' (ver mais abaixo), sem NF ainda.
  let contaId = corpo.contaId ?? null;
  const orcamentoIdBody = corpo.orcamentoId ?? null;
  const acao = corpo.acao ?? 'emitir';
  if (!contaId && !orcamentoIdBody) return json({ error: 'Informe contaId ou orcamentoId.' }, 400);

  const authFocus = 'Basic ' + btoa(`${focusToken}:`);

  if (acao === 'consultar') {
    if (!contaId) return json({ error: 'contaId é obrigatório para consultar.' }, 400);
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
      // A emissão é assíncrona - o erro de negócio de verdade (ex.: "Série
      // da DPS inválida") normalmente aparece só AQUI (na consulta), não no
      // POST inicial (que só valida schema). Guarda o JSON bruto inteiro,
      // não só a mensagem curta de cada erro - a Focus às vezes tem mais
      // contexto (código, campo apontado) que o "mensagem" sozinho não mostra.
      const mensagens = Array.isArray(resultado.erros)
        ? resultado.erros.map((e: { mensagem?: string }) => e.mensagem).join('; ')
        : null;
      const detalhe = `${mensagens ?? 'erro sem mensagem'} | RAW: ${JSON.stringify(resultado)}`;
      await supabaseAdmin
        .from('contas_receber')
        .update({ nfse_status: 'erro', nfse_erro_detalhe: detalhe })
        .eq('id', contaId);
    } else if (resultado.status === 'cancelado') {
      await supabaseAdmin.from('contas_receber').update({ nfse_status: 'cancelada' }).eq('id', contaId);
    } else {
      // Status ainda não é nenhum dos terminais conhecidos - grava a
      // resposta bruta em nfse_erro_detalhe só pra diagnóstico (não muda
      // nfse_status), já que o app não mostra esse retorno em lugar
      // nenhum e "processando" sem mais detalhe não ajuda a entender o
      // que está de fato acontecendo do lado da Focus NFe/prefeitura.
      await supabaseAdmin
        .from('contas_receber')
        .update({ nfse_erro_detalhe: `[debug] status="${resultado.status}" - ${JSON.stringify(resultado)}` })
        .eq('id', contaId);
    }

    return json({ ok: true, resultado });
  }

  // acao === 'emitir' ou 'previsualizar'
  type ContaLike = {
    id: number | null;
    valor: number;
    nf_numero: string | null;
    cliente_id: number;
    descricao: string | null;
    orcamentos: {
      numero_orcamento: string;
      ordem_servico_id: number | null;
      ordens_servico: { numero_os: string } | null;
    } | null;
  };
  let conta: ContaLike;
  // Quando a conta precisar ser criada agora (veio só orcamentoId), guarda
  // o orçamento pra vincular - só usado dentro do bloco de criação, mais
  // abaixo, depois que 'previsualizar' já tiver retornado.
  let orcamentoIdParaCriarConta: number | null = null;

  if (contaId) {
    const { data: contaExistente, error: erroConta } = await supabaseAdmin
      .from('contas_receber')
      .select(
        'id, valor, nf_numero, cliente_id, descricao, orcamento_id, orcamentos(numero_orcamento, ordem_servico_id, ordens_servico(numero_os))',
      )
      .eq('id', contaId)
      .single();
    if (erroConta || !contaExistente) return json({ error: 'Conta a receber não encontrada.' }, 404);
    if (contaExistente.nf_numero) return json({ error: 'Essa conta já tem NF lançada.' }, 400);
    conta = contaExistente as unknown as ContaLike;
  } else {
    // Sem conta ainda - monta os dados direto do orçamento (mesma fórmula
    // de src/lib/valorOrcamento.ts: valor_fixo_contrato OU soma dos itens,
    // menos desconto, zerado se for bonificação).
    const { data: orcRow, error: erroOrc } = await supabaseAdmin
      .from('orcamentos')
      .select(
        'id, numero_orcamento, ordem_servico_id, valor_fixo_contrato, desconto, bonificacao, orcamento_itens(preco_unitario, quantidade), ordens_servico(numero_os, cliente_id)',
      )
      .eq('id', orcamentoIdBody)
      .single();
    if (erroOrc || !orcRow) return json({ error: 'Orçamento não encontrado.' }, 404);
    const orcTyped = orcRow as unknown as {
      id: number;
      numero_orcamento: string;
      ordem_servico_id: number | null;
      valor_fixo_contrato: number | null;
      desconto: number | null;
      bonificacao: boolean | null;
      orcamento_itens: { preco_unitario: number | null; quantidade: number }[];
      ordens_servico: { numero_os: string; cliente_id: number } | null;
    };
    const clienteIdOrc = orcTyped.ordens_servico?.cliente_id;
    if (!clienteIdOrc) return json({ error: 'Não foi possível identificar o cliente desse orçamento.' }, 400);
    const subtotal =
      orcTyped.valor_fixo_contrato != null
        ? Number(orcTyped.valor_fixo_contrato)
        : (orcTyped.orcamento_itens ?? []).reduce(
            (s, i) => s + (Number(i.preco_unitario) || 0) * Number(i.quantidade),
            0,
          );
    const valorCalc = orcTyped.bonificacao ? 0 : Math.max(subtotal - (Number(orcTyped.desconto) || 0), 0);
    const numeroOS = orcTyped.ordens_servico?.numero_os ?? '';
    conta = {
      id: null,
      valor: valorCalc,
      nf_numero: null,
      cliente_id: clienteIdOrc,
      descricao: `Orçamento ${orcTyped.numero_orcamento} - OS ${numeroOS}`,
      orcamentos: {
        numero_orcamento: orcTyped.numero_orcamento,
        ordem_servico_id: orcTyped.ordem_servico_id,
        ordens_servico: { numero_os: numeroOS },
      },
    };
    orcamentoIdParaCriarConta = orcTyped.id;
  }
  if (!conta.valor || conta.valor <= 0) return json({ error: 'Valor da conta precisa ser maior que zero.' }, 400);

  const { data: cliente, error: erroCliente } = await supabaseAdmin
    .from('clientes')
    .select('cnpj, razao_social, logradouro, numero_endereco, complemento, bairro, cidade, uf, cep, telefone, email')
    .eq('id', conta.cliente_id)
    .single();
  if (erroCliente || !cliente) return json({ error: 'Cliente da conta não encontrado.' }, 404);

  // Sobrescritas vindas da tela de conferência (Faturamento) - o setor de
  // faturamento pode corrigir dados do tomador ali mesmo antes de
  // transmitir (ex.: endereço que faltava no cadastro), sem precisar sair
  // pra editar o cliente primeiro. Cada campo só sobrescreve se vier
  // preenchido - em branco, usa o valor do cadastro normalmente.
  const overrides = corpo.overrides ?? {};
  const razaoSocialTomador = overrides.razao_social_tomador?.trim() || cliente.razao_social;
  const documentoTomadorBruto = overrides.documento_tomador?.trim() || cliente.cnpj;
  const logradouroTomador = overrides.logradouro_tomador?.trim() || cliente.logradouro;
  const numeroEnderecoTomador = overrides.numero_tomador?.trim() || cliente.numero_endereco;
  const complementoTomador = overrides.complemento_tomador?.trim() || cliente.complemento;
  const bairroTomador = overrides.bairro_tomador?.trim() || cliente.bairro;
  const cepTomador = overrides.cep_tomador?.trim() || cliente.cep;
  const cidadeTomador = overrides.cidade_tomador?.trim() || cliente.cidade;
  const ufTomador = overrides.uf_tomador?.trim() || cliente.uf;
  const telefoneTomador = overrides.telefone_tomador?.trim() || cliente.telefone;
  const emailTomador = overrides.email_tomador?.trim() || cliente.email;

  const documentoTomador = apenasDigitos(documentoTomadorBruto);
  if (documentoTomador.length !== 14 && documentoTomador.length !== 11) {
    return json({ error: 'CNPJ/CPF do cliente inválido ou não cadastrado - corrija em Cadastros → Clientes.' }, 400);
  }
  if (!razaoSocialTomador) {
    return json({ error: 'Razão social do cliente não cadastrada - corrija em Cadastros → Clientes.' }, 400);
  }

  // Alíquota do ISS - a contabilidade reenvia todo mês (recalculada em
  // cima do faturamento, padrão Simples Nacional), atualizada em
  // Faturamento.tsx ("Alíquota ISS atual"). Só envia se estiver
  // preenchida - sem ela, o campo fica de fora do payload (o guia oficial
  // desse município não marca como obrigatório).
  const { data: configFiscal } = await supabaseAdmin
    .from('configuracao_fiscal')
    .select('aliquota_iss, percentual_total_tributos_federais, percentual_total_tributos_municipais')
    .eq('id', 1)
    .maybeSingle();
  const aliquotaIss = configFiscal?.aliquota_iss ? Number(configFiscal.aliquota_iss) : null;
  // Descoberto em teste (2026-09-01): informar a alíquota do ISS
  // (percentual_aliquota_relativa_municipio) faz o schema passar a
  // exigir também um dos dois: tribFed (PIS/COFINS) OU totTrib dentro do
  // grupo "trib". Usa o totTrib (percentuais totais de tributos,
  // Federal/Municipal, fonte IBPT - confirmados com o contador, não
  // mudam com frequência, diferente da alíquota ISS).
  const percentualTotalTributosFederais = configFiscal?.percentual_total_tributos_federais
    ? Number(configFiscal.percentual_total_tributos_federais)
    : null;
  const percentualTotalTributosMunicipais = configFiscal?.percentual_total_tributos_municipais
    ? Number(configFiscal.percentual_total_tributos_municipais)
    : null;

  // Endereço completo do tomador - a nota real (nº 2902) mostra que a
  // prefeitura recebe esses dados, mas o cadastro de clientes só guarda
  // o nome da cidade (não o código IBGE que o campo pede). Resolve via
  // consulta pública ao IBGE; se não conseguir achar, os campos de
  // endereço simplesmente ficam de fora (nunca inventa um código).
  const codigoMunicipioTomador = await codigoIbgeMunicipio(cidadeTomador, ufTomador);
  // Só manda o endereço se tiver o essencial completo - ver comentário
  // junto do payload sobre o grupo ser tudo-ou-nada no schema.
  const enderecoTomadorCompleto = codigoMunicipioTomador != null && !!cepTomador && !!logradouroTomador;

  const orc = (
    conta as unknown as {
      orcamentos: { numero_orcamento: string; ordem_servico_id: number | null; ordens_servico: { numero_os: string } | null } | null;
    }
  ).orcamentos;

  // O que veio pra manutenção (ex.: "CAMISA PARA ARTROSCOPIA", "160mm x
  // 4mm x 30° - ARTROSCOPIA DE JOELHO/OMBRO") - cada OS tem no máximo uma
  // entrada de equipamento (confirmado: nenhuma OS tem mais de uma), então
  // dá pra usar direto como a 3ª linha da descrição do serviço.
  const { data: entradaEquip } = orc?.ordem_servico_id
    ? await supabaseAdmin
        .from('entradas_equipamento')
        .select('equipamento_desc')
        .eq('ordem_servico_id', orc.ordem_servico_id)
        .maybeSingle()
    : { data: null };

  // Valor aproximado dos tributos (Lei 12.741/2012 - Lei da Transparência
  // Fiscal): não é o percentual, é o R$ daquela nota específica, calculado
  // sobre o valor do serviço com os percentuais Federal+Municipal do IBPT
  // (mesmos já usados no totTrib do payload).
  const valorAproxTributos =
    percentualTotalTributosFederais != null && percentualTotalTributosMunicipais != null
      ? (Number(conta.valor) * (percentualTotalTributosFederais + percentualTotalTributosMunicipais)) / 100
      : null;

  // Formato fixo pedido pelo usuário (2026-09-02): 4 linhas sempre nessa
  // ordem - texto fixo, referência ao orçamento, o que veio pra
  // manutenção, e o valor (não percentual) dos tributos daquela nota.
  const descricaoServicoPadrao = [
    'MANUTENÇÃO EM EQUIPAMENTO',
    orc ? `REFERENTE AO ORÇAMENTO - ORC: ${orc.numero_orcamento}` : conta.descricao || 'Prestação de serviço',
    entradaEquip?.equipamento_desc || 'Instrumental cirúrgico',
    valorAproxTributos != null
      ? `Valor aproximado dos tributos: R$ ${valorAproxTributos.toFixed(2)} (Fonte: IBPT - Lei 12.741/2012)`
      : 'Valor aproximado dos tributos: não informado',
  ].join('\n');
  const descricaoServico = overrides.descricao_servico?.trim() || descricaoServicoPadrao;

  // acao === 'previsualizar': monta o mesmo payload que seria enviado à
  // Focus NFe, mas devolve pro frontend sem transmitir nada - usado pela
  // tela de conferência antes de emitir de fato (pedido do faturamento
  // pra revisar os dados da DPS antes de mandar pro SEFAZ).
  let ref = `qcvf-cr-${conta.id}`;
  const payload = {
    data_emissao: dataEmissaoISO(),
    serie_dps: serieDps,
    numero_dps: conta.id,
    data_competencia: dataEmissaoISO().slice(0, 10),
    emitente_dps: 1,
    codigo_municipio_emissora: CODIGO_MUNICIPIO_RIBEIRAO_PRETO,
    cnpj_prestador: CNPJ_PRESTADOR,
    inscricao_municipal_prestador: INSCRICAO_MUNICIPAL_PRESTADOR,
    codigo_opcao_simples_nacional: CODIGO_OPCAO_SIMPLES_NACIONAL,
    regime_tributario_simples_nacional: REGIME_TRIBUTARIO_SIMPLES_NACIONAL,
    regime_especial_tributacao: 0,
    ...(documentoTomador.length === 14 ? { cnpj_tomador: documentoTomador } : { cpf_tomador: documentoTomador }),
    razao_social_tomador: razaoSocialTomador,
    // Endereço do tomador - o schema exige o grupo inteiro (cMun+CEP
    // dentro de endNac, xLgr dentro de end) ou nada - mandar só uma
    // parte (ex: só o município) quebra a nota ("endNac: falta CEP").
    // Por isso só entra quando TEM os 3 dados essenciais completos.
    ...(enderecoTomadorCompleto
      ? {
          codigo_municipio_tomador: codigoMunicipioTomador,
          cep_tomador: apenasDigitos(cepTomador!),
          logradouro_tomador: logradouroTomador,
          ...(numeroEnderecoTomador ? { numero_tomador: numeroEnderecoTomador } : {}),
          ...(complementoTomador ? { complemento_tomador: complementoTomador } : {}),
          ...(bairroTomador ? { bairro_tomador: bairroTomador } : {}),
        }
      : {}),
    ...(telefoneTomador ? { telefone_tomador: telefoneTomador } : {}),
    ...(emailTomador ? { email_tomador: emailTomador } : {}),
    codigo_municipio_prestacao: CODIGO_MUNICIPIO_RIBEIRAO_PRETO,
    codigo_tributacao_nacional_iss: CODIGO_TRIBUTACAO_NACIONAL_ISS,
    codigo_tributacao_municipal_iss: CODIGO_TRIBUTACAO_MUNICIPAL_ISS,
    descricao_servico: descricaoServico,
    codigo_nbs: CODIGO_NBS,
    valor_servico: conta.valor,
    tributacao_iss: 1,
    tipo_retencao_iss: TIPO_RETENCAO_ISS,
    ...(aliquotaIss != null ? { percentual_aliquota_relativa_municipio: aliquotaIss } : {}),
    ...(percentualTotalTributosFederais != null
      ? { percentual_total_tributos_federais: percentualTotalTributosFederais }
      : {}),
    ...(percentualTotalTributosMunicipais != null
      ? { percentual_total_tributos_municipais: percentualTotalTributosMunicipais }
      : {}),
    // Grupo IBS/CBS (Reforma Tributária) - ver constantes no topo do arquivo.
    finalidade_emissao: 0,
    consumidor_final: 0,
    indicador_destinatario: 0,
    codigo_indicador_operacao: CODIGO_INDICADOR_OPERACAO,
    ibs_cbs_situacao_tributaria: CST_IBS_CBS,
    ibs_cbs_classificacao_tributaria: CLASSIFICACAO_TRIBUTARIA_IBS_CBS,
  };

  if (acao === 'previsualizar') {
    return json({
      ok: true,
      payload,
      resumo: {
        // Usado pra tela de conferência decidir se mostra a marca d'água
        // "HOMOLOGAÇÃO" na prévia da DANFSe - some sozinho quando
        // FOCUS_NFE_BASE_URL apontar pra produção.
        ambiente,
        clienteId: conta.cliente_id,
        razaoSocialTomador,
        documentoTomador: documentoTomadorBruto,
        logradouroTomador: logradouroTomador ?? '',
        numeroEnderecoTomador: numeroEnderecoTomador ?? '',
        complementoTomador: complementoTomador ?? '',
        bairroTomador: bairroTomador ?? '',
        cepTomador: cepTomador ?? '',
        cidadeTomador: cidadeTomador ?? '',
        ufTomador: ufTomador ?? '',
        telefoneTomador: telefoneTomador ?? '',
        emailTomador: emailTomador ?? '',
        descricaoServico,
        valorServico: conta.valor,
        aliquotaIss,
        percentualTotalTributosFederais,
        percentualTotalTributosMunicipais,
      },
    });
  }

  // A partir daqui é 'emitir' de verdade. Se a conta ainda não existia
  // (veio só orcamentoId - orçamento "Liberado" direto, sem passar por
  // "Lançar NF" antes), cria ela AGORA, sem NF ainda - o número/chave só
  // são preenchidos depois, quando a Focus autorizar (branch 'consultar'
  // acima). numero_dps e a referência (ref) usados no payload/POST
  // precisam ser recalculados com o id real recém-criado.
  if (conta.id == null) {
    const numeroConta = await proximoNumeroConta(supabaseAdmin);
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 30);
    const { data: novaConta, error: erroNovaConta } = await supabaseAdmin
      .from('contas_receber')
      .insert({
        numero_conta: numeroConta,
        orcamento_id: orcamentoIdParaCriarConta,
        cliente_id: conta.cliente_id,
        descricao: conta.descricao,
        valor: conta.valor,
        data_vencimento: vencimento.toISOString().slice(0, 10),
        status: 'Em aberto',
      })
      .select('id')
      .single();
    if (erroNovaConta || !novaConta) {
      return json({ error: 'Falha ao criar a conta a receber para este orçamento.' }, 500);
    }
    conta.id = novaConta.id;
    contaId = novaConta.id;
    payload.numero_dps = conta.id;
    ref = `qcvf-cr-${conta.id}`;
  }

  // Regra confirmada em teste real (2026-09-02, erro E0235 da SEFAZ
  // Nacional): quando o tomador é identificado por CNPJ (é sempre o
  // nosso caso - nunca CPF), o endereço nacional completo é OBRIGATÓRIO,
  // não opcional. Antes disso o código só omitia o grupo de endereço
  // quando incompleto (silenciosamente) - agora bloqueia a emissão com
  // uma mensagem clara em vez de deixar a Focus rejeitar sem contexto.
  if (documentoTomador.length === 14 && !enderecoTomadorCompleto) {
    return json(
      {
        error:
          'Endereço do cliente incompleto - a NFS-e nacional exige logradouro, CEP e cidade/UF quando o tomador é identificado por CNPJ. Complete o cadastro em Cadastros → Clientes (ou pela tela de conferência, "Salvar no cadastro") antes de emitir.',
      },
      400,
    );
  }

  const resp = await fetch(`${focusBaseUrl}/v2/nfsen?ref=${encodeURIComponent(ref)}`, {
    method: 'POST',
    headers: { Authorization: authFocus, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const resultado = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    // Guarda a resposta BRUTA inteira (não só "mensagem") - a Focus às
    // vezes devolve um "mensagem" curto e genérico que não bate com a
    // causa real (ex.: "Série da DPS inválida" mesmo já tendo testado
    // duas séries diferentes) - precisamos do JSON completo (código de
    // erro, campo apontado, etc.) pra diagnosticar direito, não adivinhar.
    const detalheCompleto = `HTTP ${resp.status} | ${JSON.stringify(resultado)}`;
    await supabaseAdmin
      .from('contas_receber')
      .update({ nfse_status: 'erro', nfse_erro_detalhe: detalheCompleto })
      .eq('id', contaId);
    // A mensagem da Focus (resultado.mensagem) vai direto no "error" - antes
    // só ia um texto genérico "Falha ao emitir NFS-e" pro frontend, e o
    // motivo real (ex.: token inválido, série errada) só aparecia consultando
    // nfse_erro_detalhe no banco. Descoberto no primeiro teste real de
    // produção (2026-09-04): erro 401 "Access token inválido" ficou
    // escondido atrás desse texto genérico.
    const mensagemFocus =
      typeof resultado?.mensagem === 'string'
        ? resultado.mensagem
        : typeof resultado?.erro === 'string'
          ? resultado.erro
          : JSON.stringify(resultado);
    return json({ error: `Falha ao emitir NFS-e (HTTP ${resp.status}): ${mensagemFocus}`, detalhe: resultado }, 502);
  }

  await supabaseAdmin
    .from('contas_receber')
    .update({ nfse_status: 'processando', nfse_ref: ref, nfse_erro_detalhe: null })
    .eq('id', contaId);

  return json({ ok: true, contaId, ref, resultado });
});
