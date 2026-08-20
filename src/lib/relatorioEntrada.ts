import { abrirImpressao } from './imprimir';
import { linkEmail, linkWhatsApp, PORTAL_CLIENTE_URL } from './compartilhar';
import { type ChecklistAvarias } from './checklistAvarias';
import { formatarMoeda } from './formato';
import type { AvariaTriagem } from './useAvariasTriagem';

// Extraído de EntradaEquipamento.tsx::imprimirRelatorio - usado tanto
// pela tela de Entrada quanto pela tela de Registro de Entrada
// (revisão pós-conversão em OS), e embutido dentro do orçamento
// combinado enviado ao cliente (Orçamento Financeiro).
export interface DadosEntradaParaRelatorio {
  codigo_entrada: string;
  equipamento_desc: string | null;
  equipamento_fab: string | null;
  equipamento_sn: string | null;
  defeito_relatado: string | null;
  condicao_chegada: string | null;
  data_entrada: string;
  triagem_avarias: ChecklistAvarias | null;
  numero_controle_cliente: string | null;
  nf_remessa_numero: string | null;
  nf_remessa_serie: string | null;
  nf_remessa_cfop: string | null;
  nf_remessa_chave_acesso: string | null;
  nf_remessa_data_emissao: string | null;
  nf_remessa_valor: number | null;
}

export interface ClienteParaRelatorio {
  razao_social: string;
  telefone?: string | null;
  email?: string | null;
  cnpj?: string | null;
  nome_fantasia?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

// Só o fragmento HTML (sem abrir janela) - usado sozinho pela tela de
// Registro de Entrada, e embutido dentro do orçamento pelo Orçamento
// Financeiro no momento do envio ao cliente.
export function montarCorpoRegistroEntrada(
  cliente: ClienteParaRelatorio | undefined,
  entrada: DadosEntradaParaRelatorio,
  fotosUrls: string[],
  clienteFinal?: { razao_social: string } | null,
  avariasDisponiveis: AvariaTriagem[] = [],
): string {
  const avariasMarcadas = avariasDisponiveis
    .filter((item) => entrada.triagem_avarias?.[String(item.id)])
    .map((item) => item.descricao);
  const fotosHtml = fotosUrls.length
    ? `<div class="secao">Fotos</div><div class="fotos">${fotosUrls.map((u) => `<img src="${u}" />`).join('')}</div>`
    : '';

  return `
    <h1>Registro de Entrada</h1>
    <p class="subtitulo">Q-CVF Medical - Manutenção em Equipamentos Cirúrgicos</p>
    <div class="laudo-caixa">
      <div><strong>Código:</strong> <span class="mono">${entrada.codigo_entrada}</span></div>
    </div>

    <div class="laudo-secao">Identificação do cliente</div>
    <div class="laudo-caixa">
      <div class="laudo-linha-dupla">
        <div><strong>Razão social:</strong> ${cliente?.razao_social ?? '-'}</div>
        <div><strong>CNPJ/CPF:</strong> ${cliente?.cnpj ?? '-'}</div>
      </div>
      <div class="laudo-linha-dupla">
        <div><strong>Nome fantasia:</strong> ${cliente?.nome_fantasia ?? '-'}</div>
        <div><strong>Cidade/UF:</strong> ${cliente?.cidade ? `${cliente.cidade}${cliente.uf ? '/' + cliente.uf : ''}` : '-'}</div>
      </div>
      <div class="laudo-linha-dupla">
        <div><strong>Endereço:</strong> ${cliente?.endereco ?? '-'}</div>
      </div>
      <div class="laudo-linha-dupla">
        <div><strong>Telefone:</strong> ${cliente?.telefone ?? '-'}</div>
        <div><strong>E-mail:</strong> ${cliente?.email ?? '-'}</div>
      </div>
      ${clienteFinal ? `<div class="laudo-linha-dupla"><div><strong>Unidade atendida:</strong> ${clienteFinal.razao_social}</div></div>` : ''}
    </div>
    <div class="linha"><div class="rotulo">Equipamento</div><div class="valor">${entrada.equipamento_desc ?? '-'}</div></div>
    <div class="linha"><div class="rotulo">Fabricante</div><div class="valor">${entrada.equipamento_fab ?? '-'}</div></div>
    <div class="linha"><div class="rotulo">Nº de série</div><div class="valor">${entrada.equipamento_sn ?? '-'}</div></div>
    <div class="linha"><div class="rotulo">Defeito relatado</div><div class="valor">${entrada.defeito_relatado ?? '-'}</div></div>
    <div class="linha"><div class="rotulo">Condição de chegada</div><div class="valor">${entrada.condicao_chegada ?? '-'}</div></div>
    <div class="linha"><div class="rotulo">Data</div><div class="valor">${new Date(entrada.data_entrada).toLocaleString('pt-BR')}</div></div>
    <div class="secao">Nota fiscal de remessa para conserto</div>
    ${entrada.numero_controle_cliente ? `<div class="linha"><div class="rotulo">Nº controle do cliente</div><div class="valor mono">${entrada.numero_controle_cliente}</div></div>` : ''}
    <div class="linha"><div class="rotulo">Número/Série</div><div class="valor mono">${entrada.nf_remessa_numero ?? '-'} / ${entrada.nf_remessa_serie ?? '-'}</div></div>
    <div class="linha"><div class="rotulo">CFOP</div><div class="valor">${entrada.nf_remessa_cfop ?? '-'}</div></div>
    <div class="linha"><div class="rotulo">Chave de acesso</div><div class="valor mono">${entrada.nf_remessa_chave_acesso ?? '-'}</div></div>
    <div class="linha"><div class="rotulo">Emissão / Valor</div><div class="valor">${entrada.nf_remessa_data_emissao ?? '-'} ${entrada.nf_remessa_valor ? '- ' + formatarMoeda(entrada.nf_remessa_valor) : ''}</div></div>
    <div class="secao">Avarias identificadas na triagem</div>
    <div class="valor">${avariasMarcadas.length ? avariasMarcadas.join(', ') : 'Nenhuma avaria marcada'}</div>
    ${fotosHtml}
  `;
}

// Abre a janela de impressão sozinha (Entrada / Registro de Entrada,
// quando impresso isoladamente - não embutido no orçamento).
export function imprimirRegistroEntrada(
  cliente: ClienteParaRelatorio | undefined,
  entrada: DadosEntradaParaRelatorio,
  fotosUrls: string[],
  avariasDisponiveis: AvariaTriagem[] = [],
) {
  const corpo = montarCorpoRegistroEntrada(cliente, entrada, fotosUrls, undefined, avariasDisponiveis);
  const mensagem = `Olá! Recebemos o equipamento ${entrada.equipamento_desc ?? ''} (entrada ${entrada.codigo_entrada}). Acompanhe o andamento no portal do cliente: ${PORTAL_CLIENTE_URL}`;
  abrirImpressao(
    `Registro de Entrada ${entrada.codigo_entrada}`,
    corpo,
    cliente
      ? {
          whatsapp: linkWhatsApp(cliente.telefone, mensagem),
          email: linkEmail(cliente.email, `Q-CVF Medical - Registro de Entrada ${entrada.codigo_entrada}`, mensagem),
        }
      : undefined,
    { assinaturas: ['Recebido por (Q-CVF Medical)', 'Entregue por (Cliente / Transportadora)'] },
  );
}
