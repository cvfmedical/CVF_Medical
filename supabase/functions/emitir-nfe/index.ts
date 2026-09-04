// Emite (e consulta) NF-e de PRODUTO/MERCADORIA via Focus NFe - devolução de
// equipamento recebido para conserto (CFOP 5916/6916), e consulta de NF-e
// de remessa RECEBIDA do cliente (CFOP 5915/6915, pra preencher os campos
// de "Nota fiscal de remessa" na Entrada sem digitar à mão).
//
// Documento DIFERENTE da NFS-e (emitir-nfse/index.ts): NF-e é modelo 55,
// documento ESTADUAL (SEFAZ, não prefeitura), envolve ICMS/CST-CSOSN/NCM -
// nada disso existe na NFS-e (tributação municipal de serviço). Mesmo
// esqueleto de auth/CORS/erro da emitir-nfse, mas payload e regras fiscais
// totalmente diferentes.
//
// TODOS os valores fiscais abaixo (CFOP, CSOSN, NCM, natureza da operação,
// tratamento de IPI/PIS/COFINS) foram extraídos de uma NF-e REAL já
// autorizada pela CVF (nº 673, série 1, XML autorizado em 03/09/2026,
// devolução parcial referente à NF 19496 de remessa recebida da RW
// Medical) - nenhum código fiscal foi adivinhado.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Dados fixos do emitente (CVF) - confirmados no XML real (nº 673):
// <emit><CNPJ>46948692000103</CNPJ>...<IE>120621075111</IE><CRT>1</CRT>
// <enderEmit><xLgr>RUA SETE DE SETEMBRO</xLgr><nro>1929</nro>
// <xBairro>JARDIM SUMARE</xBairro><cMun>3543402</cMun><UF>SP</UF>
// <CEP>14025384</CEP>
const CNPJ_EMITENTE = '46948692000103';
const IE_EMITENTE = '120621075111'; // confirmado no XML real - nunca existia registrado em lugar nenhum do sistema antes
const CRT_EMITENTE = 1; // 1 = Simples Nacional (confirmado no XML real, <CRT>1</CRT>)
const NOME_EMITENTE = 'CVF MEDICAL MANUTENCAO EM EQUIPAMENTOS CIRURGICOS LTDA';
const NOME_FANTASIA_EMITENTE = 'CVF Medical';
const LOGRADOURO_EMITENTE = 'RUA SETE DE SETEMBRO';
const NUMERO_EMITENTE = '1929';
const BAIRRO_EMITENTE = 'JARDIM SUMARE';
const CEP_EMITENTE = '14025384';
const UF_EMITENTE = 'SP';
const CODIGO_MUNICIPIO_RIBEIRAO_PRETO = 3543402; // mesmo código IBGE já usado/confirmado na NFS-e

// Natureza da operação e tributação da DEVOLUÇÃO - confirmados no item do
// XML real: <NCM>90181910</NCM><CFOP>5916</CFOP> ... <ICMSSN102><orig>0</orig>
// <CSOSN>400</CSOSN></ICMSSN102> ... <IPITrib><CST>99</CST><pIPI>0.00</pIPI>
// <PISNT><CST>08</CST> ... <COFINSNT><CST>08</CST>
const NATUREZA_OPERACAO_DEVOLUCAO = 'DEVOLUCAO REMESSA RECEBIDA P CONSERTO';
const NCM_PADRAO = '90181910'; // confirmado pra ótica/camisa de artroscopia (Karl Storz, Bazek, Artiflex) - mesmo valor usado em catalogo_oticas.ncm/produtos_servicos.ncm
const CSOSN_DEVOLUCAO = '400'; // "Não tributada pelo Simples Nacional" - confirmado no XML real
const ICMS_ORIGEM = '0'; // nacional
// IPI: o XML real tem um bloco IPITrib (CST 99, alíquota 0%) - mas a lista
// de campos essenciais da API da Focus não inclui campo de IPI, e a
// alíquota real é zero de qualquer forma. Omitido do payload por ora; se a
// Focus recusar por falta de IPI, adicionar depois com o valor confirmado.
const PIS_CST_NAO_TRIBUTADO = '08';
const COFINS_CST_NAO_TRIBUTADO = '08';
// CFOP: 5916 = devolução dentro do mesmo estado (SP->SP), 6916 = devolução
// interestadual - decidido comparando a UF do cliente com UF_EMITENTE.
function cfopDevolucao(ufDestinatario: string): string {
  return ufDestinatario.trim().toUpperCase() === UF_EMITENTE ? '5916' : '6916';
}
function idDestino(ufDestinatario: string): number {
  // 1 = operação interna (mesma UF), 2 = interestadual - confirmado <idDest>1</idDest> no XML real (SP->SP)
  return ufDestinatario.trim().toUpperCase() === UF_EMITENTE ? 1 : 2;
}

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

// Mesmo helper já usado/confirmado em emitir-nfse - consulta pública do
// IBGE, sem chave, pra resolver o código de 7 dígitos do município do
// destinatário a partir do nome da cidade (cadastro de clientes só guarda
// texto livre).
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

// Mesmo bug/fix já confirmado em emitir-nfse: Deno Edge Functions rodam em
// UTC, não em horário de Brasília - sem timeZone explícito a data/hora
// declarada fica ~3h à frente do instante real.
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
  const hora = partes.hour === '24' ? '00' : partes.hour;
  return `${partes.year}-${partes.month}-${partes.day}T${hora}:${partes.minute}:${partes.second}-03:00`;
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
  // Segredo PRÓPRIO (não reaproveita FOCUS_NFE_TOKEN da NFS-e) - pode ser a
  // mesma conta Focus, mas o token de acesso costuma ser específico por
  // empresa/produto; mantém configurável em separado por segurança.
  const focusTokenNfe = Deno.env.get('FOCUS_NFE_TOKEN_NFE') ?? focusToken;
  const focusBaseUrl = Deno.env.get('FOCUS_NFE_BASE_URL') ?? 'https://homologacao.focusnfe.com.br';
  const ambiente: 'homologacao' | 'producao' = focusBaseUrl.includes('homologacao') ? 'homologacao' : 'producao';

  if (!focusTokenNfe) return json({ error: 'FOCUS_NFE_TOKEN_NFE (ou FOCUS_NFE_TOKEN) não configurado no servidor.' }, 500);

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
  if (!chamador) return json({ error: 'Só funcionários podem emitir/consultar NF-e.' }, 403);

  let corpo: {
    entregaId?: number;
    chaveAcesso?: string;
    acao?: 'consultar_remessa' | 'previsualizar_devolucao' | 'emitir_devolucao' | 'consultar_devolucao' | 'cancelar_devolucao';
    serie?: number;
    justificativa?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  const acao = corpo.acao ?? 'previsualizar_devolucao';
  const authFocus = 'Basic ' + btoa(`${focusTokenNfe}:`);

  // === Consulta de NF-e de REMESSA recebida do cliente (por chave de
  // acesso) - só devolve os dados pro formulário preencher, nunca grava
  // nada sozinha. Documentado em
  // doc.focusnfe.com.br/reference/consultar_nfe_recebida_individual.md
  if (acao === 'consultar_remessa') {
    const chave = apenasDigitos(corpo.chaveAcesso);
    if (chave.length !== 44) return json({ error: 'Chave de acesso precisa ter 44 dígitos.' }, 400);

    const resp = await fetch(`${focusBaseUrl}/v2/nfe_recebidas/${chave}`, {
      headers: { Authorization: authFocus },
    });
    const resultado = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const mensagemFocus = typeof resultado?.mensagem === 'string' ? resultado.mensagem : JSON.stringify(resultado);
      return json({ error: `Falha ao consultar a NF-e (HTTP ${resp.status}): ${mensagemFocus}` }, 502);
    }
    return json({ ok: true, resultado });
  }

  // === Ações relacionadas à DEVOLUÇÃO (emitida por nós) ===

  if (acao === 'consultar_devolucao' || acao === 'cancelar_devolucao') {
    if (!corpo.entregaId) return json({ error: 'entregaId é obrigatório.' }, 400);
    const { data: entrega, error: erroEntrega } = await supabaseAdmin
      .from('entregas')
      .select('id, nfe_devolucao_ref, nfe_devolucao_status')
      .eq('id', corpo.entregaId)
      .single();
    if (erroEntrega || !entrega) return json({ error: 'Entrega não encontrada.' }, 404);
    if (!entrega.nfe_devolucao_ref) return json({ error: 'Essa entrega ainda não teve NF-e de devolução emitida por aqui.' }, 400);

    if (acao === 'cancelar_devolucao') {
      // Documentado como possível só até 24h após a emissão - prazo bem
      // mais curto que o da NFS-e (que costuma ter vários dias).
      if (entrega.nfe_devolucao_status === 'cancelada') return json({ error: 'Essa NF-e já está cancelada.' }, 400);
      const justificativa = typeof corpo.justificativa === 'string' ? corpo.justificativa.trim() : '';
      const resp = await fetch(`${focusBaseUrl}/v2/nfe/${entrega.nfe_devolucao_ref}`, {
        method: 'DELETE',
        headers: { Authorization: authFocus, 'Content-Type': 'application/json' },
        body: JSON.stringify(justificativa ? { justificativa } : {}),
      });
      const resultado = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const mensagemFocus = typeof resultado?.mensagem === 'string' ? resultado.mensagem : JSON.stringify(resultado);
        return json({ error: `Falha ao cancelar NF-e (HTTP ${resp.status}): ${mensagemFocus} - lembrando que só é possível cancelar até 24h após a emissão.` }, 502);
      }
      const { error: erroUpdate } = await supabaseAdmin
        .from('entregas')
        .update({ nfe_devolucao_status: 'cancelada', nfe_devolucao_erro_detalhe: null })
        .eq('id', corpo.entregaId);
      if (erroUpdate) return json({ error: `Cancelou na SEFAZ, mas falhou ao gravar no banco: ${erroUpdate.message}` }, 500);
      return json({ ok: true, resultado });
    }

    // consultar_devolucao
    const resp = await fetch(`${focusBaseUrl}/v2/nfe/${entrega.nfe_devolucao_ref}`, {
      headers: { Authorization: authFocus },
    });
    const resultado = await resp.json().catch(() => ({}));

    let erroGravacao: string | null = null;
    if (resultado.status === 'autorizado') {
      const { error: erroUpdate } = await supabaseAdmin
        .from('entregas')
        .update({
          nf_devolucao_numero: resultado.numero != null ? String(resultado.numero) : null,
          nf_devolucao_serie: resultado.serie != null ? String(resultado.serie) : null,
          nf_devolucao_chave_acesso: resultado.chave_nfe ?? null,
          nf_devolucao_data_emissao: resultado.data_emissao ? String(resultado.data_emissao).slice(0, 10) : null,
          nfe_devolucao_status: 'autorizada',
          nfe_devolucao_erro_detalhe: null,
        })
        .eq('id', corpo.entregaId);
      if (erroUpdate) erroGravacao = erroUpdate.message;
    } else if (resultado.status === 'erro_autorizacao' || resultado.status === 'rejeitado' || resultado.status === 'denegado') {
      const mensagens = Array.isArray(resultado.erros)
        ? resultado.erros.map((e: { mensagem?: string }) => e.mensagem).join('; ')
        : null;
      const detalhe = `${mensagens ?? resultado.mensagem_sefaz ?? 'erro sem mensagem'} | RAW: ${JSON.stringify(resultado)}`;
      const { error: erroUpdate } = await supabaseAdmin
        .from('entregas')
        .update({ nfe_devolucao_status: 'erro', nfe_devolucao_erro_detalhe: detalhe })
        .eq('id', corpo.entregaId);
      if (erroUpdate) erroGravacao = erroUpdate.message;
    } else if (resultado.status === 'cancelado') {
      const { error: erroUpdate } = await supabaseAdmin
        .from('entregas')
        .update({ nfe_devolucao_status: 'cancelada' })
        .eq('id', corpo.entregaId);
      if (erroUpdate) erroGravacao = erroUpdate.message;
    } else {
      const { error: erroUpdate } = await supabaseAdmin
        .from('entregas')
        .update({ nfe_devolucao_erro_detalhe: `[debug] status="${resultado.status}" - ${JSON.stringify(resultado)}` })
        .eq('id', corpo.entregaId);
      if (erroUpdate) erroGravacao = erroUpdate.message;
    }
    if (erroGravacao) {
      return json({ error: `A consulta funcionou, mas falhou ao gravar o resultado no banco: ${erroGravacao}`, resultado }, 500);
    }
    return json({ ok: true, resultado });
  }

  // === previsualizar_devolucao / emitir_devolucao ===
  if (!corpo.entregaId) return json({ error: 'entregaId é obrigatório.' }, 400);

  const { data: entrega, error: erroEntrega } = await supabaseAdmin
    .from('entregas')
    .select(
      'id, ordem_servico_id, nf_devolucao_numero, ordens_servico(id, numero_os, cliente_id, optica_desc, optica_fab, cliente_nome, entradas_equipamento(nf_remessa_chave_acesso, nf_remessa_numero, catalogo_otica_id, produto_servico_id))',
    )
    .eq('id', corpo.entregaId)
    .single();
  if (erroEntrega || !entrega) return json({ error: 'Entrega não encontrada.' }, 404);
  if (entrega.nf_devolucao_numero) return json({ error: 'Essa entrega já tem NF-e de devolução lançada.' }, 400);

  const os = (
    entrega as unknown as {
      ordens_servico: {
        id: number;
        numero_os: string;
        cliente_id: number;
        optica_desc: string | null;
        optica_fab: string | null;
        cliente_nome: string;
        entradas_equipamento: { nf_remessa_chave_acesso: string | null; nf_remessa_numero: string | null; catalogo_otica_id: number | null; produto_servico_id: number | null }[] | null;
      } | null;
    }
  ).ordens_servico;
  if (!os) return json({ error: 'OS vinculada não encontrada.' }, 404);

  const entradaEquip = os.entradas_equipamento?.[0] ?? null;

  const { data: cliente, error: erroCliente } = await supabaseAdmin
    .from('clientes')
    .select('cnpj, razao_social, logradouro, numero_endereco, bairro, cidade, uf, cep, telefone')
    .eq('id', os.cliente_id)
    .single();
  if (erroCliente || !cliente) return json({ error: 'Cliente da OS não encontrado.' }, 404);
  if (!cliente.logradouro || !cliente.cep || !cliente.cidade || !cliente.uf) {
    return json({ error: 'Endereço do cliente incompleto - complete em Cadastros → Clientes antes de emitir a devolução.' }, 400);
  }

  const documentoCliente = apenasDigitos(cliente.cnpj);
  if (documentoCliente.length !== 14 && documentoCliente.length !== 11) {
    return json({ error: 'CNPJ/CPF do cliente inválido ou não cadastrado - corrija em Cadastros → Clientes.' }, 400);
  }

  const codigoMunicipioDestinatario = await codigoIbgeMunicipio(cliente.cidade, cliente.uf);
  const cfop = cfopDevolucao(cliente.uf);
  const idDest = idDestino(cliente.uf);

  // NCM do item: tenta o catálogo específico (ótica ou produto/serviço)
  // vinculado na Entrada; se não achar, cai no padrão confirmado na nota
  // real (90181910) - nunca fica sem NCM.
  let ncmItem = NCM_PADRAO;
  if (entradaEquip?.catalogo_otica_id) {
    const { data: cat } = await supabaseAdmin.from('catalogo_oticas').select('ncm').eq('id', entradaEquip.catalogo_otica_id).maybeSingle();
    if (cat?.ncm) ncmItem = cat.ncm;
  } else if (entradaEquip?.produto_servico_id) {
    const { data: prod } = await supabaseAdmin.from('produtos_servicos').select('ncm').eq('id', entradaEquip.produto_servico_id).maybeSingle();
    if (prod?.ncm) ncmItem = prod.ncm;
  }

  const descricaoItem = [os.optica_desc, os.optica_fab].filter(Boolean).join(' - ') || `Equipamento OS ${os.numero_os}`;
  const numeroRemessa = entradaEquip?.nf_remessa_numero ?? null;
  const chaveRemessa = entradaEquip?.nf_remessa_chave_acesso ? apenasDigitos(entradaEquip.nf_remessa_chave_acesso) : null;

  // Valor do bem devolvido - não temos um "preço do bem" cadastrado (a
  // CVF cobra é a mão de obra do conserto, valor à parte, já faturado via
  // NFS-e); usa o mesmo valor simbólico que a nota real usou quando não
  // há venda de fato (valor de referência do próprio bem, não da mão de
  // obra) - por ora, exige que o usuário informe esse valor na tela de
  // conferência (não adivinha).
  const ref = `qcvf-devol-${entrega.id}`;
  const infCpl = numeroRemessa
    ? `DEVOLUÇÃO REFERENTE À NF ${numeroRemessa}`
    : 'DEVOLUÇÃO DE EQUIPAMENTO RECEBIDO PARA CONSERTO';

  const payload = {
    natureza_operacao: NATUREZA_OPERACAO_DEVOLUCAO,
    data_emissao: dataEmissaoISO(),
    tipo_documento: 1, // saída
    finalidade_emissao: 1, // "normal" - confirmado no XML real (<finNFe>1</finNFe>), apesar do nome sugerir "Devolução" seria 4
    consumidor_final: 1, // confirmado no XML real (<indFinal>1</indFinal>)
    presenca_comprador: 1, // confirmado no XML real (<indPres>1</indPres>)
    local_destino: idDest,
    serie: corpo.serie ?? 1, // confirmado: CVF já usava série 1 no sistema antigo (nota real nº 673, série 1)
    cnpj_emitente: CNPJ_EMITENTE,
    nome_emitente: NOME_EMITENTE,
    nome_fantasia_emitente: NOME_FANTASIA_EMITENTE,
    logradouro_emitente: LOGRADOURO_EMITENTE,
    numero_emitente: NUMERO_EMITENTE,
    bairro_emitente: BAIRRO_EMITENTE,
    municipio_emitente: 'Ribeirão Preto',
    codigo_municipio_emitente: CODIGO_MUNICIPIO_RIBEIRAO_PRETO,
    uf_emitente: UF_EMITENTE,
    cep_emitente: CEP_EMITENTE,
    inscricao_estadual_emitente: IE_EMITENTE,
    regime_tributario_emitente: CRT_EMITENTE,
    ...(documentoCliente.length === 14 ? { cnpj_destinatario: documentoCliente } : { cpf_destinatario: documentoCliente }),
    nome_destinatario: cliente.razao_social,
    indicador_inscricao_estadual_destinatario: 9, // "Não Contribuinte" - mesmo valor visto no XML real pro destinatário
    logradouro_destinatario: cliente.logradouro,
    numero_destinatario: cliente.numero_endereco || 'S/N',
    bairro_destinatario: cliente.bairro || 'Não informado',
    municipio_destinatario: cliente.cidade,
    uf_destinatario: cliente.uf,
    cep_destinatario: apenasDigitos(cliente.cep),
    telefone_destinatario: cliente.telefone ?? undefined,
    ...(codigoMunicipioDestinatario ? { codigo_municipio_destinatario: codigoMunicipioDestinatario } : {}),
    modalidade_frete: 9, // "Sem frete" - confirmado no XML real (<modFrete>9</modFrete>)
    informacoes_complementares: infCpl,
    ...(chaveRemessa && chaveRemessa.length === 44 ? { notas_referenciadas: [{ chave_nfe: chaveRemessa }] } : {}),
    items: [
      {
        numero_item: 1,
        codigo_produto: `OS-${os.numero_os}`,
        descricao: descricaoItem,
        cfop,
        codigo_ncm: ncmItem,
        quantidade_comercial: 1,
        quantidade_tributavel: 1,
        unidade_comercial: 'UN',
        unidade_tributavel: 'UN',
        valor_unitario_comercial: null as unknown as number, // preenchido abaixo, obrigatório vir da tela de conferência
        valor_unitario_tributavel: null as unknown as number,
        valor_bruto: null as unknown as number,
        inclui_no_total: 1,
        icms_origem: ICMS_ORIGEM,
        icms_situacao_tributaria: CSOSN_DEVOLUCAO,
        pis_situacao_tributaria: PIS_CST_NAO_TRIBUTADO,
        cofins_situacao_tributaria: COFINS_CST_NAO_TRIBUTADO,
      },
    ],
  };

  if (acao === 'previsualizar_devolucao') {
    return json({
      ok: true,
      payload,
      resumo: {
        ambiente,
        clienteId: os.cliente_id,
        razaoSocialDestinatario: cliente.razao_social,
        documentoDestinatario: cliente.cnpj,
        numeroOS: os.numero_os,
        descricaoItem,
        cfop,
        ncm: ncmItem,
        numeroRemessa,
        chaveRemessa,
      },
    });
  }

  // acao === 'emitir_devolucao'
  const valor = typeof (corpo as { valorBem?: number }).valorBem === 'number' ? (corpo as { valorBem?: number }).valorBem : null;
  if (!valor || valor <= 0) {
    return json({ error: 'Informe o valor do bem devolvido (valorBem) antes de transmitir.' }, 400);
  }
  payload.items[0].valor_unitario_comercial = valor;
  payload.items[0].valor_unitario_tributavel = valor;
  payload.items[0].valor_bruto = valor;

  const resp = await fetch(`${focusBaseUrl}/v2/nfe?ref=${encodeURIComponent(ref)}`, {
    method: 'POST',
    headers: { Authorization: authFocus, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const resultado = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const detalheCompleto = `HTTP ${resp.status} | ${JSON.stringify(resultado)}`;
    await supabaseAdmin
      .from('entregas')
      .update({ nfe_devolucao_status: 'erro', nfe_devolucao_erro_detalhe: detalheCompleto })
      .eq('id', corpo.entregaId);
    const mensagemFocus = typeof resultado?.mensagem === 'string' ? resultado.mensagem : JSON.stringify(resultado);
    return json({ error: `Falha ao emitir NF-e de devolução (HTTP ${resp.status}): ${mensagemFocus}`, detalhe: resultado }, 502);
  }

  await supabaseAdmin
    .from('entregas')
    .update({ nfe_devolucao_status: 'processando', nfe_devolucao_ref: ref, nfe_devolucao_erro_detalhe: null })
    .eq('id', corpo.entregaId);

  return json({ ok: true, ref, resultado });
});
