import cvfLogoCompleto from '../assets/cvf-logo-completo.png';

export interface LinksCompartilharImpressao {
  whatsapp?: string;
  email?: string;
}

export interface OpcoesImpressao {
  // Rótulos dos dois campos de assinatura no rodapé do relatório -
  // padrão cobre o caso genérico (equipe Q-CVF / cliente).
  assinaturas?: [string, string];
}

const ASSINATURAS_PADRAO: [string, string] = ['Q-CVF Medical', 'Cliente'];

// Abre uma janela nova só com o conteúdo do relatório e chama print() -
// evita ter que gerar PDF pra relatórios simples de impressão (para
// salvar em PDF, o próprio diálogo de impressão do navegador tem a
// opção "Salvar como PDF" como destino). Os links de WhatsApp/e-mail
// são pré-montados por quem chama (precisam do telefone/e-mail do
// cliente, que essa janela isolada não tem acesso).
export function abrirImpressao(
  titulo: string,
  corpoHtml: string,
  links?: LinksCompartilharImpressao,
  opcoes?: OpcoesImpressao,
) {
  const janela = window.open('', '_blank', 'width=850,height=950');
  if (!janela) {
    alert('Não foi possível abrir a janela de impressão (verifique o bloqueador de pop-ups).');
    return;
  }
  const [assinaturaA, assinaturaB] = opcoes?.assinaturas ?? ASSINATURAS_PADRAO;

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
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
      <style>
        :root {
          --graphite-900: #1b1d20;
          --copper-500: #c9814b;
          --copper-800: #6b4423;
          --teal-500: #3e7a6f;
          --ink-900: #21201c;
          --ink-600: #5c5a54;
          --ink-400: #8c8a83;
          --paper-50: #f5f3ee;
          --border: #e4e1d8;
        }
        * { box-sizing: border-box; }
        body {
          font-family: 'IBM Plex Sans', Helvetica, Arial, sans-serif;
          color: var(--ink-900);
          margin: 0;
          background: var(--paper-50);
        }
        .folha { max-width: 760px; margin: 0 auto; background: #fff; min-height: 100vh; }
        .cabecalho-relatorio {
          display: flex; align-items: center; gap: 16px;
          padding: 28px 40px 20px; border-bottom: 3px solid var(--copper-500);
        }
        .cabecalho-relatorio img { height: 44px; width: auto; }
        .cabecalho-relatorio .identidade { font-size: 10px; color: var(--ink-400); line-height: 1.5; }
        .corpo-relatorio { padding: 28px 40px; }
        h1 {
          font-family: 'Space Grotesk', sans-serif;
          color: var(--graphite-900);
          font-size: 19px;
          margin: 0 0 2px;
        }
        .subtitulo { color: var(--ink-600); font-size: 12px; margin-bottom: 24px; }
        .linha { display: flex; margin-bottom: 8px; font-size: 13px; }
        .rotulo { width: 160px; font-weight: 500; color: var(--ink-600); }
        .valor { flex: 1; }
        .mono { font-family: 'IBM Plex Mono', ui-monospace, Consolas, monospace; }
        .secao {
          margin-top: 24px; font-weight: 600; font-size: 13px; letter-spacing: 0.02em;
          text-transform: uppercase; color: var(--copper-800);
          border-bottom: 1px solid var(--border); padding-bottom: 6px;
        }
        .fotos { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
        .fotos img { max-width: 220px; max-height: 220px; border: 1px solid var(--border); border-radius: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
        th { background: var(--graphite-900); color: #fff; font-weight: 500; text-align: left; padding: 8px; }
        td { border-bottom: 1px solid var(--border); padding: 8px; }
        .assinaturas { display: flex; gap: 48px; margin-top: 64px; }
        .assinatura-bloco { flex: 1; text-align: center; }
        .assinatura-linha {
          border-top: 1px solid var(--ink-900); margin-top: 56px; padding-top: 6px;
          font-size: 12px; color: var(--ink-900);
        }
        .assinatura-data { font-size: 11px; color: var(--ink-400); margin-top: 4px; }
        .rodape-relatorio {
          margin-top: 40px; padding: 16px 40px; border-top: 1px solid var(--border);
          font-size: 10px; color: var(--ink-400); text-align: center;
        }
        .acoes-impressao { margin: 24px 40px 0; display: flex; gap: 10px; flex-wrap: wrap; }
        .acoes-impressao button, .botao-acao {
          padding: 10px 20px; border-radius: 6px; border: 1px solid var(--border); background: #fff;
          color: var(--ink-900); font-size: 13px; text-decoration: none; cursor: pointer; display: inline-block;
        }
        .acoes-impressao button { background: var(--copper-500); color: #fff; border: none; }
        .dica-pdf { font-size: 11px; color: var(--ink-600); margin: 8px 40px 24px; }
        .quebra-pagina { page-break-before: always; break-before: page; padding-top: 1px; }
        @media print {
          body { background: #fff; }
          .folha { max-width: none; }
          .acoes-impressao, .dica-pdf { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="folha">
        <div class="cabecalho-relatorio">
          <img src="${cvfLogoCompleto}" alt="Q-CVF Medical" />
          <div class="identidade">
            CVF MEDICAL MANUT. EM EQUIPAMENTOS CIRÚRGICOS LTDA<br>
            CNPJ: 46.948.692/0001-03 | Ribeirão Preto/SP
          </div>
        </div>
        <div class="corpo-relatorio">
          ${corpoHtml}
          <div class="assinaturas">
            <div class="assinatura-bloco">
              <div class="assinatura-linha">${assinaturaA}</div>
              <div class="assinatura-data">Data: ____/____/________</div>
            </div>
            <div class="assinatura-bloco">
              <div class="assinatura-linha">${assinaturaB}</div>
              <div class="assinatura-data">Data: ____/____/________</div>
            </div>
          </div>
        </div>
        <div class="rodape-relatorio">Documento gerado pelo sistema Q-CVF Medical</div>
      </div>
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
