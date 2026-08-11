import { EMPRESA } from './formato';

// Cabeçalho institucional: faixa grafite + logomarca + slogan + faixa de
// gradiente (cobre->teal). SVG inline (sem dependência externa) para
// repetir no <thead> de cada página impressa. viewBox recortado no fim
// da faixa de gradiente (sem espaço morto embaixo).
const CABECALHO_SVG = `<div class="cabecalho-svg"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 133" style="width:100%;height:auto;display:block"><defs><linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#C2703D"/><stop offset="100%" stop-color="#2A9D8F"/></linearGradient><clipPath id="cornerClip"><rect x="0" y="0" width="920" height="128"/></clipPath></defs><rect x="0" y="0" width="920" height="128" fill="#4A4F57"/><g transform="translate(40,24) scale(0.42)"><path d="M 141.50,144.75 L 142.75,147.50 L 152.25,147.50 L 153.25,145.25 Z M 318.50,135.50 L 318.75,155.25 L 337.00,156.25 L 336.75,153.00 L 321.75,152.50 L 321.50,135.75 Z M 280.25,138.00 L 277.25,143.25 L 277.50,156.00 L 280.25,155.50 L 281.50,150.75 L 293.25,150.75 L 294.75,155.50 L 297.25,156.00 L 297.25,135.75 L 284.75,135.50 Z M 280.75,142.50 L 286.25,138.50 L 293.50,138.50 L 294.75,146.25 L 281.25,147.75 Z M 240.75,136.50 L 239.00,140.25 L 240.00,154.25 L 257.25,156.00 L 256.75,153.00 L 242.50,152.25 L 242.00,140.25 L 243.50,138.50 L 257.00,138.50 L 257.50,135.75 Z M 216.75,135.25 L 215.25,155.25 L 218.00,156.00 L 218.50,135.75 Z M 175.75,135.50 L 175.00,155.25 L 188.00,156.00 L 193.25,153.50 L 195.50,149.00 L 193.50,138.25 L 187.50,135.25 Z M 178.25,138.75 L 190.75,140.00 L 192.25,149.00 L 189.75,152.25 L 177.75,152.25 Z M 137.00,135.50 L 136.25,153.25 L 140.00,156.00 L 154.25,156.00 L 154.00,153.00 L 139.50,152.00 L 139.25,139.75 L 154.00,138.50 L 154.75,135.75 Z M 91.50,135.75 L 91.50,156.00 L 94.50,155.25 L 95.25,144.50 L 103.50,156.50 L 111.75,144.75 L 112.25,155.50 L 115.25,156.00 L 115.00,135.50 L 112.50,136.00 L 103.50,150.75 L 94.25,136.00 Z M 268.75,127.50 L 277.50,125.75 L 284.75,118.50 L 287.75,97.00 L 315.50,94.50 L 322.75,86.75 L 324.50,79.00 L 270.00,79.75 Z M 270.25,68.00 L 323.50,68.00 L 332.75,62.25 L 337.50,50.75 L 287.50,51.25 L 276.75,57.00 Z M 92.50,111.25 L 100.75,122.75 L 111.25,127.50 L 168.00,128.00 L 164.50,117.00 L 155.75,110.75 L 116.00,110.00 L 109.50,104.00 L 109.50,74.00 L 112.00,69.75 L 167.75,68.50 L 174.50,74.50 L 176.25,124.25 L 182.50,128.25 L 208.00,124.25 L 228.25,113.25 L 243.50,98.00 L 255.75,79.25 L 267.50,50.50 L 258.25,50.25 L 249.25,54.75 L 235.00,79.75 L 223.75,94.00 L 210.50,104.50 L 198.00,109.25 L 192.75,108.25 L 192.50,62.50 L 185.00,52.50 L 179.50,50.25 L 108.75,51.25 L 97.50,58.75 L 92.25,68.50 Z" fill="#FFFFFF" fill-rule="evenodd"/></g><line x1="200" y1="26" x2="200" y2="102" stroke="#6B7078" stroke-width="1"/><text x="222" y="64" font-family="Arial, Helvetica, sans-serif" font-style="italic" font-size="26" fill="#E8A870" dominant-baseline="middle">Sua imagem, nossa visão.</text><g clip-path="url(#cornerClip)" stroke="#5FC4B5" fill="none"><circle cx="905" cy="30" r="58" stroke-width="1"/><circle cx="905" cy="30" r="44" stroke-width="1"/><circle cx="905" cy="30" r="30" stroke-width="1"/><circle cx="905" cy="30" r="17" stroke-width="1"/></g><rect x="0" y="128" width="920" height="5" fill="url(#accentGrad)"/></svg></div>`;

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
    EMPRESA.telefone ? `Tel. / WhatsApp: ${EMPRESA.telefone}` : '',
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
        .cabecalho-svg { line-height: 0; }
        .cabecalho-svg svg { width: 100%; height: auto; display: block; }
        .corpo { padding: 22px 40px 8px; }
        /* --- Capa do relatório combinado --- */
        .capa-titulo {
          font-family: 'Space Grotesk', sans-serif; font-size: 27px; color: var(--graphite-900);
          margin: 28px 0 20px; line-height: 1.15; max-width: 520px;
        }
        .ficha {
          display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border);
          border-radius: 8px; overflow: hidden; margin-bottom: 24px;
        }
        .ficha-linha { display: flex; flex-direction: column; padding: 11px 18px; border-bottom: 1px solid var(--border); }
        .ficha-linha:nth-child(odd) { border-right: 1px solid var(--border); }
        .ficha-linha:nth-last-child(-n+2) { border-bottom: none; }
        .ficha-rot { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-400); margin-bottom: 3px; }
        .ficha-val { font-size: 14px; font-weight: 600; color: var(--ink-900); }
        .sumario { background: var(--paper-50); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
        .sumario h3 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-600); }
        .sumario ol { margin: 0; padding-left: 20px; line-height: 1.9; }
        .mvv { border-top: 2px solid var(--copper-500); padding-top: 16px; margin-top: 6px; }
        .mvv-item { margin-bottom: 14px; }
        .mvv-rot { font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 600; color: var(--copper-800); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3px; }
        .mvv-txt { font-size: 12.5px; color: var(--ink-600); line-height: 1.55; }
        .tag-secao { display: inline-block; font-size: 11px; font-weight: 600; color: #fff; background: var(--copper-500); border-radius: 20px; padding: 3px 12px; margin-bottom: 10px; letter-spacing: .03em; }
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
        /* Tabela de peças da OS: foto na mesma linha do item/observação */
        table.itens-os { width: 100%; border-collapse: collapse; margin-top: 8px; }
        table.itens-os th { background: var(--graphite-900); color: #fff; font-weight: 500; text-align: left; padding: 8px 10px; font-size: 12px; }
        table.itens-os td { border-bottom: 1px solid var(--border); padding: 8px 10px; vertical-align: top; }
        table.itens-os .col-qtd { text-align: center; width: 48px; }
        table.itens-os .col-foto { width: 150px; }
        table.itens-os .foto-item { max-width: 130px; max-height: 100px; border: 1px solid var(--border); border-radius: 4px; display: block; }
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
              ${CABECALHO_SVG}
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
