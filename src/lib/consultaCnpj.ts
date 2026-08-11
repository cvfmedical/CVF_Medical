import { somenteDigitos } from './cnpj';

export interface DadosCnpj {
  razao_social: string;
  nome_fantasia: string;
  telefone: string;
  email: string;
  logradouro: string;
  numero_endereco: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  situacao_cadastral: string;
  natureza_juridica: string;
  cnae_principal: string;
  data_abertura: string | null;
  porte: string;
}

// Resultado tipado: em vez de "null pra tudo", diz o MOTIVO da falha, para a
// tela dar uma mensagem clara (limite da API x não encontrado x rede).
export type ResultadoCnpj =
  | { ok: true; dados: DadosCnpj }
  | { ok: false; motivo: 'cnpj_invalido' | 'nao_encontrado' | 'limite' | 'rede' };

type Tentativa =
  | { status: 'ok'; dados: DadosCnpj }
  | { status: 'limite' }
  | { status: 'nao_encontrado' }
  | { status: 'rede' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fonte 1: BrasilAPI (agrega Receita Federal). Gratuita, mas com limite de taxa.
async function buscarBrasilApi(cnpj: string): Promise<Tentativa> {
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (resp.status === 404) return { status: 'nao_encontrado' };
    if (resp.status === 429 || resp.status >= 500) return { status: 'limite' };
    if (!resp.ok) return { status: 'rede' };
    const d = await resp.json();
    return {
      status: 'ok',
      dados: {
        razao_social: d.razao_social ?? '',
        nome_fantasia: d.nome_fantasia ?? '',
        telefone: d.ddd_telefone_1 ?? '',
        email: d.email ?? '',
        logradouro: d.logradouro ?? '',
        numero_endereco: d.numero ?? '',
        complemento: d.complemento ?? '',
        bairro: d.bairro ?? '',
        cidade: d.municipio ?? '',
        uf: d.uf ?? '',
        cep: d.cep ?? '',
        situacao_cadastral: d.descricao_situacao_cadastral ?? '',
        natureza_juridica: d.natureza_juridica ?? '',
        cnae_principal: d.cnae_fiscal_descricao ?? '',
        data_abertura: d.data_inicio_atividade ?? null,
        porte: d.porte ?? '',
      },
    };
  } catch {
    return { status: 'rede' };
  }
}

// Fonte 2 (reserva): CNPJ.ws público. Estrutura aninhada em "estabelecimento".
async function buscarCnpjWs(cnpj: string): Promise<Tentativa> {
  try {
    const resp = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    if (resp.status === 404) return { status: 'nao_encontrado' };
    if (resp.status === 429 || resp.status >= 500) return { status: 'limite' };
    if (!resp.ok) return { status: 'rede' };
    const d = await resp.json();
    const est = d.estabelecimento ?? {};
    const cidade = typeof est.cidade === 'string' ? est.cidade : (est.cidade?.nome ?? '');
    const uf = est.estado?.sigla ?? est.estado_sigla ?? (typeof est.estado === 'string' ? est.estado : '');
    const telefone = est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : '';
    const logradouro = [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' ');
    return {
      status: 'ok',
      dados: {
        razao_social: d.razao_social ?? '',
        nome_fantasia: est.nome_fantasia ?? '',
        telefone,
        email: est.email ?? '',
        logradouro,
        numero_endereco: est.numero ?? '',
        complemento: est.complemento ?? '',
        bairro: est.bairro ?? '',
        cidade,
        uf,
        cep: est.cep ?? '',
        situacao_cadastral: est.situacao_cadastral ?? '',
        natureza_juridica: d.natureza_juridica?.descricao ?? '',
        cnae_principal: est.atividade_principal?.descricao ?? '',
        data_abertura: est.data_inicio_atividade ?? null,
        porte: d.porte?.descricao ?? '',
      },
    };
  } catch {
    return { status: 'rede' };
  }
}

// Consulta pública e gratuita para pré-preencher o cadastro a partir do CNPJ.
// Tenta BrasilAPI (com 2 tentativas e backoff em limite/rede) e, se falhar,
// cai na CNPJ.ws. Devolve o motivo pra tela orientar o usuário.
export async function consultarCnpj(cnpjEntrada: string): Promise<ResultadoCnpj> {
  const cnpj = somenteDigitos(cnpjEntrada);
  if (cnpj.length !== 14) return { ok: false, motivo: 'cnpj_invalido' };

  const fontes = [buscarBrasilApi, buscarCnpjWs];
  let ultimo: Tentativa = { status: 'rede' };
  for (const fonte of fontes) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const r = await fonte(cnpj);
      ultimo = r;
      if (r.status === 'ok') return { ok: true, dados: r.dados };
      if (r.status === 'nao_encontrado') break; // não adianta repetir a mesma fonte
      await sleep(500 * (tentativa + 1)); // limite/rede: espera e tenta de novo
    }
  }
  const motivo =
    ultimo.status === 'nao_encontrado' ? 'nao_encontrado' : ultimo.status === 'limite' ? 'limite' : 'rede';
  return { ok: false, motivo };
}
