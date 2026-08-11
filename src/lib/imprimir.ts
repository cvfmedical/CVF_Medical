import cvfLogoCompleto from '../assets/cvf-logo-completo.png';
import { EMPRESA } from './formato';

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

// Abre uma janela nova só com o conteúdo do relatório e chama print().
// O layout usa <thead>/<tfoot> de uma tabela que envolve o conteúdo: o
// navegador REPETE o cabeçalho (logo) e o rodapé (contato) em TODAS as
// páginas impressas - inclusive no PDF salvo pelo diálogo de impressão.
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

  const contatoRodape = [
    EMPRESA.telefone ? `Tel.: ${EMPRESA.telefone}` : '',
    `E-mail: ${EMPRESA.email}`,
  ]
    .filter(Boolean)
    .join(' &nbsp;•&nbsp; ');

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
          font-size: 13px;
        }
        .folha { max-width: 800px; margin: 0 auto; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,0.08); }
        table.pagina { width: 100%; border-collapse: collapse; }
        /* thead/tfoot repetem em todas as páginas na impressão */
        .cabecalho {
          display: flex; align-items: center; gap: 16px;
          padding: 22px 40px 14px; border-bottom: 3px solid var(--copper-500);
        }
        .cabecalho img { height: 46px; width: auto; }
        .cabecalho .identidade { font-size: 10px; color: var(--ink-400); line-height: 1.55; }
        .cabecalho .identidade strong { color: var(--ink-600); font-size: 10.5px; }
        .corpo { padding: 22px 40px 8px; }
        .rodape {
          padding: 10px 40px 16px; border-top: 1px solid var(--border);
          font-size: 9.5px; color: var(--ink-600); line-height: 1.5; text-align: center;
        }
        .rodape .empresa { font-weight: 600; color: var(--ink-900); }
        h1 { font-family: 'Space Grotesk', sans-serif; color: var(--graphite-900); font-size: 19px; margin: 0 0 2px; }
        .subtitulo { color: var(--ink-600); font-size: 12px; margin-bottom: 22px; }
        .linha { display: flex; margin-bottom: 8px; }
        .rotulo { width: 160px; font-weight: 500; color: var(--ink-600); }
        .valor { flex: 1; }
        .mono { font-family: 'IBM Plex Mono', ui-monospace, Consolas, monospace; }
        .secao {
          margin-top: 22px; font-weight: 600; font-size: 12.5px; letter-spacing: 0.03em;
          text-transform: uppercase; color: var(--copper-800);
          border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 8px;
        }
        .fotos { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
        .fotos img { max-width: 220px; max-height: 220px; border: 1px solid var(--border); border-radius: 4px; }
        table.dados { width: 100%; border-collapse: collapse; margin-top: 8px; }
        table.dados th { background: var(--graphite-900); color: #fff; font-weight: 500; text-align: left; padding: 8px 10px; font-size: 12px; }
        table.dados td { border-bottom: 1px solid var(--border); padding: 8px 10px; }
        /* alinha valores monetários à direita (colunas de preço/subtotal) */
        table.dados td:nth-child(n+3), table.dados th:nth-child(n+3) { text-align: right; }
        .total-linha { text-align: right; font-weight: 600; font-size: 14px; margin-top: 12px; }
        .assinaturas { display: flex; gap: 48px; margin-top: 56px; }
        .assinatura-bloco { flex: 1; text-align: center; }
        .assinatura-linha { border-top: 1px solid var(--ink-900); margin-top: 48px; padding-top: 6px; font-size: 12px; }
        .assinatura-data { font-size: 11px; color: var(--ink-400); margin-top: 4px; }
        .quebra-pagina { page-break-before: always; break-before: page; padding-top: 1px; }
        .acoes-impressao { max-width: 800px; margin: 20px auto 0; padding: 0 8px; display: flex; gap: 10px; flex-wrap: wrap; }
        .acoes-impressao button, .botao-acao {
          padding: 10px 20px; border-radius: 6px; border: 1px solid var(--border); background: #fff;
          color: var(--ink-900); font-size: 13px; text-decoration: none; cursor: pointer; display: inline-block;
        }
        .acoes-impressao button { background: var(--copper-500); color: #fff; border: none; }
        .dica-pdf { max-width: 800px; margin: 8px auto 24px; padding: 0 8px; font-size: 11px; color: var(--ink-600); }
        @media print {
          @page { margin: 12mm; }
          body { background: #fff; font-size: 12px; }
          .folha { max-width: none; box-shadow: none; }
          .acoes-impressao, .dica-pdf { display: none; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
        }
      </style>
    </head>
    <body>
      <div class="acoes-impressao">
        <button onclick="window.print()">Imprimir / salvar PDF</button>
        ${botoesCompartilhar}
      </div>
      <p class="dica-pdf">Para salvar em PDF: clique em "Imprimir / salvar PDF" e escolha "Salvar como PDF" como destino/impressora.</p>

      <div class="folha">
        <table class="pagina">
          <thead>
            <tr><td>
              <div class="cabecalho">
                <img src="${cvfLogoCompleto}" alt="Q-CVF Medical" />
                <div class="identidade">
                  <strong>${EMPRESA.razaoSocial}</strong><br>
                  CNPJ: ${EMPRESA.cnpj} &nbsp;|&nbsp; ${EMPRESA.endereco}
                </div>
              </div>
            </td></tr>
          </thead>
          <tbody>
            <tr><td>
              <div class="corpo">
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
            </td></tr>
          </tbody>
          <tfoot>
            <tr><td>
              <div class="rodape">
                <span class="empresa">${EMPRESA.razaoSocial}</span> &nbsp;•&nbsp; CNPJ: ${EMPRESA.cnpj}<br>
                ${EMPRESA.endereco}<br>
                ${contatoRodape}
              </div>
            </td></tr>
          </tfoot>
        </table>
      </div>
    </body>
    </html>
  `);
  janela.document.close();
}
