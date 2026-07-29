// Abre uma janela nova só com o conteúdo do relatório e chama print() -
// evita ter que gerar PDF pra relatórios simples de impressão.
export function abrirImpressao(titulo: string, corpoHtml: string) {
  const janela = window.open('', '_blank', 'width=800,height=900');
  if (!janela) {
    alert('Não foi possível abrir a janela de impressão (verifique o bloqueador de pop-ups).');
    return;
  }
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
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      ${corpoHtml}
      <button onclick="window.print()" style="margin-top: 24px; padding: 10px 20px;">Imprimir</button>
    </body>
    </html>
  `);
  janela.document.close();
}
