import { abrirImpressao } from './imprimir';
import { linkEmail, linkWhatsApp, PORTAL_CLIENTE_URL } from './compartilhar';

// Relatório da Ordem de Serviço: peças/serviços identificados como
// danificados pelo técnico (Orçamento Técnico), com foto e observação
// por item - sem preço (isso é trabalho do financeiro, no orçamento).
// Diferente do Registro de Entrada (relatorioEntrada.ts), que documenta
// como o equipamento chegou, não o que foi identificado tecnicamente.
export interface ItemRelatorioOS {
  nome: string;
  quantidade: number;
  observacao: string | null;
  fotoUrl: string | null;
}

export interface DadosOSParaRelatorio {
  numero_os: string;
  cliente_nome: string;
  cliente_final_nome?: string | null;
  // Identificação completa do cliente - mesmo padrão usado no Laudo de
  // equipamento (Laudos.tsx): CNPJ, endereço, cidade/UF, telefone, e-mail.
  cliente_cnpj?: string | null;
  cliente_fantasia?: string | null;
  cliente_endereco?: string | null;
  cliente_cidade?: string | null;
  cliente_uf?: string | null;
  cliente_telefone?: string | null;
  cliente_email?: string | null;
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
  defeito_relatado: string | null;
  // Observações gerais do técnico - texto livre, especialmente importante
  // quando o serviço não envolve troca de peça (nada entra na tabela de
  // itens, então sem isso o relatório ficaria vazio).
  observacoes_tecnico?: string | null;
  prazo_entrega?: string | null;
}

export function montarCorpoRelatorioOS(os: DadosOSParaRelatorio, itens: ItemRelatorioOS[]): string {
  const linhas = itens
    .map(
      (item) => `
      <tr>
        <td>${item.nome}</td>
        <td class="col-qtd">${item.quantidade}</td>
        <td>${item.observacao ?? '-'}</td>
        <td class="col-foto">${item.fotoUrl ? `<img class="foto-item" src="${item.fotoUrl}" />` : '-'}</td>
      </tr>`,
    )
    .join('');

  return `
    <h1>Ordem de Serviços - Laudo Técnico</h1>
    <p class="subtitulo">Q-CVF Medical - Manutenção em Equipamentos Cirúrgicos</p>

    <div class="laudo-caixa">
      <div class="laudo-linha-dupla">
        <div><strong>Ordem de serviço:</strong> <span class="mono">${os.numero_os}</span></div>
        <div><strong>Prazo de entrega:</strong> ${os.prazo_entrega ?? '-'}</div>
      </div>
    </div>

    <div class="laudo-secao">1. Identificação do cliente</div>
    <div class="laudo-caixa">
      <div class="laudo-linha-dupla">
        <div><strong>Razão social:</strong> ${os.cliente_nome}</div>
        <div><strong>CNPJ/CPF:</strong> ${os.cliente_cnpj ?? '-'}</div>
      </div>
      <div class="laudo-linha-dupla">
        <div><strong>Nome fantasia:</strong> ${os.cliente_fantasia ?? '-'}</div>
        <div><strong>Cidade/UF:</strong> ${os.cliente_cidade ? `${os.cliente_cidade}${os.cliente_uf ? '/' + os.cliente_uf : ''}` : '-'}</div>
      </div>
      <div class="laudo-linha-dupla">
        <div><strong>Endereço:</strong> ${os.cliente_endereco ?? '-'}</div>
      </div>
      <div class="laudo-linha-dupla">
        <div><strong>Telefone:</strong> ${os.cliente_telefone ?? '-'}</div>
        <div><strong>E-mail:</strong> ${os.cliente_email ?? '-'}</div>
      </div>
      ${os.cliente_final_nome ? `<div class="laudo-linha-dupla"><div><strong>Unidade atendida:</strong> ${os.cliente_final_nome}</div></div>` : ''}
    </div>

    <div class="laudo-secao">2. Identificação do equipamento</div>
    <div class="laudo-caixa">
      <div class="laudo-linha-dupla">
        <div><strong>Equipamento:</strong> ${os.optica_desc ?? '-'} (${os.optica_fab ?? '-'})</div>
        <div><strong>Nº de série:</strong> <span class="mono">${os.optica_sn ?? '-'}</span></div>
      </div>
      <div><strong>Defeito relatado:</strong> ${os.defeito_relatado ?? '-'}</div>
    </div>

    ${itens.length > 0 ? `
    <div class="laudo-secao">3. Peças/serviços identificados</div>
    <table class="itens-os">
      <thead><tr><th>Item</th><th class="col-qtd">Qtd.</th><th>Observação / avaria</th><th class="col-foto">Foto</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>` : ''}
    ${os.observacoes_tecnico ? `
    <div class="laudo-secao">${itens.length > 0 ? '4' : '3'}. Observações técnicas gerais</div>
    <div class="laudo-caixa"><p style="margin:0;">${os.observacoes_tecnico}</p></div>` : ''}
    ${itens.length === 0 && !os.observacoes_tecnico ? `
    <p style="color:#666;">Nenhuma peça ou observação registrada ainda.</p>` : ''}
    <p style="font-size:12px; color:#666; margin-top:12px;">
      Este relatório mostra apenas o que foi identificado tecnicamente - os valores são definidos e enviados
      separadamente pelo setor financeiro, no orçamento.
    </p>
  `;
}

export function imprimirRelatorioOS(
  cliente: { telefone?: string | null; email?: string | null } | undefined,
  os: DadosOSParaRelatorio,
  itens: ItemRelatorioOS[],
) {
  const corpo = montarCorpoRelatorioOS(os, itens);
  const mensagem = `Olá! Identificamos as avarias abaixo no equipamento ${os.optica_desc ?? ''} (OS ${os.numero_os}). O orçamento será enviado em seguida. Acompanhe pelo portal do cliente: ${PORTAL_CLIENTE_URL}`;
  abrirImpressao(
    `Ordem de Serviços - Laudo Técnico ${os.numero_os}`,
    corpo,
    cliente
      ? {
          whatsapp: linkWhatsApp(cliente.telefone, mensagem),
          email: linkEmail(cliente.email, `Q-CVF Medical - Relatório da Ordem de Serviço ${os.numero_os}`, mensagem),
        }
      : undefined,
    { assinaturas: ['Q-CVF Medical (Técnico)', 'Cliente (ciência)'] },
  );
}
