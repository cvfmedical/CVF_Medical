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

// Consulta pública e gratuita (BrasilAPI, agrega dados da Receita
// Federal) - sem chave/credencial, usada só pra pré-preencher o
// cadastro a partir do CNPJ. Devolve null se não encontrar ou a consulta
// falhar (usuário preenche manualmente nesse caso).
export async function consultarCnpj(cnpjEntrada: string): Promise<DadosCnpj | null> {
  const cnpj = somenteDigitos(cnpjEntrada);
  if (cnpj.length !== 14) return null;

  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!resp.ok) return null;
    const d = await resp.json();

    return {
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
    };
  } catch {
    return null;
  }
}
