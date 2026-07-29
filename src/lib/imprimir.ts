export interface LinksCompartilharImpressao {
  whatsapp?: string;
  email?: string;
}

// Abre uma janela nova só com o conteúdo do relatório e chama print() -
// evita ter que gerar PDF pra relatórios simples de impressão (para
// salvar em PDF, o próprio diálogo de impressão do navegador tem a
// opção "Salvar como PDF" como destino). Os links de WhatsApp/e-mail
// são pré-montados por quem chama (precisam do telefone/e-mail do
// cliente, que essa janela isolada não tem acesso).
export function abrirImpressao(titulo: string, corpoHtml: string, links?: LinksCompartilharImpressao) {
  const janela = window.open('', '_blank', 'width=800,height=900');
  if (!janela) {
    alert('Não foi possível abrir a janela de impressão (verifique o bloqueador de pop-ups).');
    return;
  }
  const botoesCompartilhar = `
    ${links?.whatsapp ? `<a class="botao-acao" href="${links.whatsapp}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ''}
    ${links?.email ? `<a class="botao-acao" href="${links.email}" target="_blank" rel="noopener">Enviar por e-mail</a>` : ''}
  `;
  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${titulo}</title>
      <style>
        body { font-family: Helvetica, Arial, sans-serif; color: #21201c; padding: 32px; }
        h1 { color: #344d95; font-size: 20px; margin-bottom: 4px; }
        .subtitulo { color: #5c5a54; font-size: 12px; margin-bottom: 24px; }
        .linha { display: flex; margin-bottom: 8px; font-size: 13px; }
        .rotulo { width: 160px; font-weight: bold; }
        .valor { flex: 1; }
        .secao { margin-top: 20px; font-weight: bold; font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        .fotos { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
        .fotos img { max-width: 220px; max-height: 220px; border: 1px solid #ccc; border-radius: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
        .acoes-impressao { margin-top: 24px; display: flex; gap: 10px; flex-wrap: wrap; }
        .acoes-impressao button, .botao-acao {
          padding: 10px 20px; border-radius: 6px; border: 1px solid #ccc; background: #fff;
          color: #21201c; font-size: 13px; text-decoration: none; cursor: pointer; display: inline-block;
        }
        .acoes-impressao button { background: #c1503e; color: #fff; border: none; }
        .dica-pdf { font-size: 11px; color: #5c5a54; margin-top: 8px; }
        @media print { .acoes-impressao, .dica-pdf { display: none; } }
      </style>
    </head>
    <body>
      ${corpoHtml}
      <div class="acoes-impressao">
        <button onclick="window.print()">Imprimir / salvar PDF</button>
        ${botoesCompartilhar}
      </div>
      <p class="dica-pdf">Para salvar em PDF: clique em "Imprimir / salvar PDF" e escolha "Salvar como PDF" como destino/impressora.</p>
    </body>
    </html>
  `);
  janela.document.close();
}
