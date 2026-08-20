import cvfLogoCompleto from '../assets/cvf-logo-completo.png';
import { EMPRESA } from './formato';

// Cabeçalho institucional: logomarca ORIGINAL (colorida) sobre fundo
// claro + slogan em azul + faixa de gradiente azul. Repetido no <thead>
// de cada página impressa.
const CABECALHO_SVG = `<div class="cabecalho-svg">
  <div class="cab-topo">
    <img src="${cvfLogoCompleto}" alt="CVF Medical" class="cab-logo" />
    <span class="cab-slogan">Sua imagem, nossa visão.</span>
  </div>
  <div class="cab-barra"></div>
</div>`;

export interface LinksCompartilharImpressao {
  whatsapp?: string;
  email?: string;
}

export interface OpcoesImpressao {
  // Rótulos dos dois campos de assinatura no rodapé do relatório -
  // padrão cobre o caso genérico (equipe Q-CVF / cliente).
  assinaturas?: [string, string];
  // Não renderar o bloco de assinaturas (ex.: documentos informativos
  // como a orientação de esterilização).
  semAssinaturas?: boolean;
  // Conteúdo anexado APÓS as assinaturas, em página nova (ex.: anexar a
  // orientação de esterilização ao final do orçamento).
  anexoHtml?: string;
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
  escreverImpressao(janela, titulo, corpoHtml, links, opcoes);
}

// Abre uma janela em branco (usada quando é preciso reservar a janela DENTRO
// do clique do usuário - ex.: gerar vários documentos de uma vez - para não
// cair no bloqueador de pop-up antes de os dados assíncronos carregarem).
export function abrirJanelaImpressao(): Window | null {
  const janela = window.open('', '_blank', 'width=850,height=950');
  if (janela) {
    janela.document.write(
      '<p style="font-family:sans-serif;padding:24px;color:#5c5a54">Gerando documento…</p>',
    );
  }
  return janela;
}

// Escreve o relatório numa janela já aberta (nova ou reservada por
// abrirJanelaImpressao). document.open() limpa qualquer placeholder anterior.
export function escreverImpressao(
  janela: Window,
  titulo: string,
  corpoHtml: string,
  links?: LinksCompartilharImpressao,
  opcoes?: OpcoesImpressao,
) {
  const [assinaturaA, assinaturaB] = opcoes?.assinaturas ?? ASSINATURAS_PADRAO;
  const semAssinaturas = opcoes?.semAssinaturas ?? false;
  const anexoHtml = opcoes?.anexoHtml ?? '';

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

  janela.document.open();
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
          --copper-500: #344d95;
          --copper-800: #26386c;
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
        .cab-topo { display: flex; align-items: center; justify-content: space-between; padding: 16px 40px 12px; background: #fff; }
        .cab-logo { height: 52px; width: auto; display: block; }
        .cab-slogan { font-family: 'Space Grotesk', sans-serif; font-style: italic; color: var(--copper-500); font-size: 18px; }
        .cab-barra { height: 5px; background: linear-gradient(90deg, #344d95, #5b78bd); }
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
        /* --- Orientação de esterilização (documento informativo) --- */
        .secao .num { display: inline-block; background: var(--copper-500); color: #fff; border-radius: 50%; width: 20px; height: 20px; line-height: 20px; text-align: center; font-size: 11px; margin-right: 8px; }
        table.metodo { width: 100%; border-collapse: collapse; margin-top: 6px; }
        table.metodo th { background: var(--graphite-900); color: #fff; font-weight: 500; text-align: left; padding: 8px 10px; font-size: 12px; }
        table.metodo td { border-bottom: 1px solid var(--border); padding: 8px 10px; vertical-align: top; }
        .alerta { background: #fbeee8; border: 1px solid #d99b7a; border-left: 4px solid #8a3b1a; border-radius: 6px; padding: 12px 16px; margin: 14px 0; color: #8a3b1a; }
        .alerta strong { color: #8a3b1a; }
        ul.check { list-style: none; padding-left: 0; margin: 6px 0; }
        ul.check li { padding: 3px 0 3px 24px; position: relative; }
        ul.check li::before { content: "\\2713"; position: absolute; left: 0; color: var(--teal-500); font-weight: 700; }
        ul.nunca li::before { content: "\\2715"; color: #8a3b1a; }
        ol.passos { margin: 6px 0; padding-left: 20px; }
        ol.passos li { margin-bottom: 5px; }
        .ref-doc { background: var(--paper-50); border: 1px solid var(--border); border-radius: 6px; padding: 14px 18px; font-size: 12px; color: var(--ink-600); }
        .ref-doc ol { margin: 0; padding-left: 18px; line-height: 1.7; }
        .ref-doc .quote { font-style: italic; color: var(--ink-900); border-left: 3px solid var(--copper-500); padding-left: 10px; margin: 8px 0; }
        .observacao-box { border: 2px solid var(--graphite-900); border-radius: 8px; padding: 14px 18px; margin-top: 22px; }
        .observacao-box .titulo { font-weight: 700; color: var(--graphite-900); text-transform: uppercase; letter-spacing: .03em; font-size: 12px; margin-bottom: 6px; }
        .observacao-box p { margin: 0; font-size: 12px; color: var(--ink-900); line-height: 1.6; }
        .rodape {
          padding: 10px 40px 16px; border-top: 1px solid var(--border);
          font-size: 9.5px; color: var(--copper-800); line-height: 1.5; text-align: center;
        }
        .rodape .empresa { font-weight: 600; color: var(--copper-500); }
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
        /* Faixa numerada + caixa - mesmo padrão visual dos laudos PDF
           (BancadaVisaoPdf/LaudoEquipamentoPdf), pra laudo impresso ter a
           mesma cara. */
        .laudo-secao {
          background: var(--copper-500); color: #fff; font-weight: 600; font-size: 11.5px;
          text-transform: uppercase; letter-spacing: 0.03em; padding: 6px 14px;
          margin-top: 18px; margin-bottom: 8px; border-radius: 4px;
        }
        .laudo-caixa {
          border: 1px solid var(--border); border-radius: 6px; padding: 10px 16px; margin-bottom: 8px;
        }
        .laudo-linha-dupla { display: flex; gap: 24px; margin-bottom: 6px; }
        .laudo-linha-dupla:last-child { margin-bottom: 0; }
        .laudo-linha-dupla > div { flex: 1; }
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
                ${
                  semAssinaturas
                    ? ''
                    : `<div class="assinaturas">
                  <div class="assinatura-bloco">
                    <div class="assinatura-linha">${assinaturaA}</div>
                    <div class="assinatura-data">Data: ____/____/________</div>
                  </div>
                  <div class="assinatura-bloco">
                    <div class="assinatura-linha">${assinaturaB}</div>
                    <div class="assinatura-data">Data: ____/____/________</div>
                  </div>
                </div>`
                }
                ${anexoHtml ? `<div class="quebra-pagina">${anexoHtml}</div>` : ''}
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
