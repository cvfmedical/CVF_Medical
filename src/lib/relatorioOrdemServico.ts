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
  optica_desc: string | null;
  optica_fab: string | null;
  optica_sn: string | null;
  defeito_relatado: string | null;
}

export function montarCorpoRelatorioOS(os: DadosOSParaRelatorio, itens: ItemRelatorioOS[]): string {
  const linhas = itens
    .map(
      (item) => `
      <tr>
        <td>${item.nome}</td>
        <td>${item.quantidade}</td>
        <td>${item.observacao ?? '-'}</td>
      </tr>
      ${item.fotoUrl ? `<tr><td colspan="3"><div class="fotos"><img src="${item.fotoUrl}" /></div></td></tr>` : ''}`,
    )
    .join('');

  return `
    <h1>Relatório da Ordem de Serviço - Peças Danificadas</h1>
    <p class="subtitulo">Q-CVF Medical - Manutenção em Equipamentos Cirúrgicos</p>
    <div class="linha"><div class="rotulo">OS</div><div class="valor mono">${os.numero_os}</div></div>
    <div class="linha"><div class="rotulo">Cliente</div><div class="valor">${os.cliente_nome}</div></div>
    <div class="linha"><div class="rotulo">Equipamento</div><div class="valor">${os.optica_desc ?? '-'} (${os.optica_fab ?? '-'})</div></div>
    <div class="linha"><div class="rotulo">Nº de série</div><div class="valor mono">${os.optica_sn ?? '-'}</div></div>
    <div class="linha"><div class="rotulo">Defeito relatado</div><div class="valor">${os.defeito_relatado ?? '-'}</div></div>
    <div class="secao">Peças/serviços identificados</div>
    <table>
      <thead><tr><th>Item</th><th>Qtd.</th><th>Observação / avaria</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
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
    `Relatório da Ordem de Serviço ${os.numero_os}`,
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
