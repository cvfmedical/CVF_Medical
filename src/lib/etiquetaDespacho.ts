import { EMPRESA } from './formato';
import cvfLogoCompleto from '../assets/cvf-logo-completo.png';

// Etiqueta de despacho pra colar na caixa enviada ao cliente - formato de
// impressora térmica (100x150mm, padrão de etiqueta de envio 4x6").
// Layout deliberadamente simples (preto e branco, sem logo/fotos): é o que
// impressoras térmicas de etiqueta imprimem bem. Diferente de
// abrirImpressao() (lib/imprimir.ts), que é pro documento A4 completo.
export interface DadosEtiquetaDespacho {
  // Opcional - deixa de fora quando a etiqueta não é de uma OS específica
  // (ex: etiqueta de postagem impressa direto do cadastro do cliente).
  numeroOS?: string | null;
  clienteNome: string;
  clienteFinalNome?: string | null;
  logradouro: string | null;
  numeroEndereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  equipamento?: string | null;
}

function formatarEndereco(d: DadosEtiquetaDespacho): string {
  const rua = [d.logradouro, d.numeroEndereco].filter(Boolean).join(', ');
  const linha1 = [rua, d.complemento].filter(Boolean).join(' - ');
  const linha2 = [d.bairro, d.cidade && d.uf ? `${d.cidade}/${d.uf}` : d.cidade].filter(Boolean).join(' - ');
  const linha3 = d.cep ? `CEP ${d.cep}` : '';
  return [linha1, linha2, linha3].filter(Boolean).join('<br>');
}

export function imprimirEtiquetaDespacho(d: DadosEtiquetaDespacho) {
  const janela = window.open('', '_blank', 'width=420,height=620');
  if (!janela) {
    alert('Não foi possível abrir a janela de impressão (verifique o bloqueador de pop-ups).');
    return;
  }

  const enderecoHtml = formatarEndereco(d);

  janela.document.open();
  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Etiqueta - ${d.numeroOS ?? d.clienteNome}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: Helvetica, Arial, sans-serif;
          color: #000;
          margin: 0;
          background: #ccc;
        }
        .acoes { text-align: center; padding: 10px; }
        .acoes button {
          padding: 10px 20px; border-radius: 6px; border: none; background: #344d95;
          color: #fff; font-size: 13px; cursor: pointer;
        }
        .etiqueta {
          width: 100mm;
          height: 150mm;
          margin: 12px auto;
          background: #fff;
          padding: 0 0 4mm;
          display: flex;
          flex-direction: column;
          border: 1px solid #999;
          overflow: hidden;
        }
        .cab-logo-wrap { text-align: center; padding: 4mm 4mm 3mm; }
        .cab-logo { height: 20mm; width: auto; }
        .cab-barra { height: 1.6mm; background: linear-gradient(90deg, #344d95, #5b78bd); }
        .miolo { padding: 3mm 4mm 0; display: flex; flex-direction: column; flex: 1; }
        .remetente {
          font-size: 9px;
          line-height: 1.4;
          color: #344d95;
          border-bottom: 1px dashed #344d95;
          padding-bottom: 6px;
          margin-bottom: 10px;
        }
        .remetente .rot { font-weight: 700; letter-spacing: 0.04em; }
        .destinatario { flex: 1; }
        .destinatario .rot {
          font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          margin-bottom: 4px; color: #344d95;
        }
        .destinatario .nome { font-size: 18px; font-weight: 700; line-height: 1.25; margin-bottom: 8px; }
        .destinatario .unidade { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
        .destinatario .endereco { font-size: 13px; line-height: 1.5; }
        .rodape {
          border-top: 2px solid #344d95;
          padding-top: 8px;
          margin-top: 10px;
        }
        .rodape .os {
          font-family: 'Courier New', monospace;
          font-size: 22px;
          font-weight: 700;
          border: 2px solid #344d95;
          color: #000;
          text-align: center;
          padding: 6px;
          letter-spacing: 0.05em;
        }
        .rodape .equip { font-size: 10px; margin-top: 6px; text-align: center; }
        @media print {
          @page { size: 100mm 150mm; margin: 0; }
          body { background: #fff; }
          .acoes { display: none; }
          .etiqueta { margin: 0; border: none; width: 100%; height: 100vh; }
        }
      </style>
    </head>
    <body>
      <div class="acoes">
        <button onclick="window.print()">Imprimir etiqueta</button>
      </div>
      <div class="etiqueta">
        <div class="cab-logo-wrap">
          <img class="cab-logo" src="${cvfLogoCompleto}" alt="CVF Medical" />
        </div>
        <div class="cab-barra"></div>
        <div class="miolo">
          <div class="remetente">
            <span class="rot">REMETENTE:</span> ${EMPRESA.razaoSocial}<br>
            ${EMPRESA.endereco}<br>
            Tel.: ${EMPRESA.telefone}
          </div>
          <div class="destinatario">
            <div class="rot">Destinatário</div>
            <div class="nome">${d.clienteNome}</div>
            ${d.clienteFinalNome ? `<div class="unidade">A/C: ${d.clienteFinalNome}</div>` : ''}
            <div class="endereco">${enderecoHtml || '<em>Endereço não cadastrado</em>'}</div>
          </div>
          ${
            d.numeroOS
              ? `<div class="rodape">
            <div class="os">OS ${d.numeroOS}</div>
            ${d.equipamento ? `<div class="equip">${d.equipamento}</div>` : ''}
          </div>`
              : ''
          }
        </div>
      </div>
    </body>
    </html>
  `);
  janela.document.close();
}

function conteudoEtiqueta(d: DadosEtiquetaDespacho): string {
  const enderecoHtml = formatarEndereco(d);
  return `
    <div class="cab-logo-wrap">
      <img class="cab-logo" src="${cvfLogoCompleto}" alt="CVF Medical" />
    </div>
    <div class="cab-barra"></div>
    <div class="miolo">
      <div class="remetente">
        <span class="rot">REMETENTE:</span> ${EMPRESA.razaoSocial}<br>
        ${EMPRESA.endereco}<br>
        Tel.: ${EMPRESA.telefone}
      </div>
      <div class="destinatario">
        <div class="rot">Destinatário</div>
        <div class="nome">${d.clienteNome}</div>
        ${d.clienteFinalNome ? `<div class="unidade">A/C: ${d.clienteFinalNome}</div>` : ''}
        <div class="endereco">${enderecoHtml || '<em>Endereço não cadastrado</em>'}</div>
      </div>
      ${
        d.numeroOS
          ? `<div class="rodape">
        <div class="os">OS ${d.numeroOS}</div>
        ${d.equipamento ? `<div class="equip">${d.equipamento}</div>` : ''}
      </div>`
          : ''
      }
    </div>
  `;
}

// Imprime várias etiquetas DIFERENTES (uma por OS) de uma vez, 4 por folha
// A4 - pra usar numa impressora comum enquanto a térmica de etiqueta
// (100x150mm) não está disponível. Pagina automaticamente de 4 em 4;
// preenche as células vazias da última folha só pra manter a grade.
export function imprimirEtiquetasDespachoLote(lista: DadosEtiquetaDespacho[]) {
  if (lista.length === 0) {
    alert('Nenhuma etiqueta para imprimir.');
    return;
  }
  const janela = window.open('', '_blank', 'width=900,height=700');
  if (!janela) {
    alert('Não foi possível abrir a janela de impressão (verifique o bloqueador de pop-ups).');
    return;
  }

  const folhas: DadosEtiquetaDespacho[][] = [];
  for (let i = 0; i < lista.length; i += 4) {
    folhas.push(lista.slice(i, i + 4));
  }

  const folhasHtml = folhas
    .map(
      (folha) => `
        <div class="folha">
          ${folha.map((d) => `<div class="etiqueta">${conteudoEtiqueta(d)}</div>`).join('')}
          ${Array.from({ length: 4 - folha.length })
            .map(() => '<div class="etiqueta etiqueta-vazia"></div>')
            .join('')}
        </div>
      `,
    )
    .join('');

  janela.document.open();
  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Etiquetas de despacho (${lista.length})</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: Helvetica, Arial, sans-serif;
          color: #000;
          margin: 0;
          background: #ccc;
        }
        .acoes { text-align: center; padding: 10px; }
        .acoes button {
          padding: 10px 20px; border-radius: 6px; border: none; background: #344d95;
          color: #fff; font-size: 13px; cursor: pointer;
        }
        .folha {
          width: 200mm;
          height: 287mm;
          margin: 12px auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 4mm;
          background: #fff;
          padding: 5mm;
        }
        .etiqueta {
          background: #fff;
          display: flex;
          flex-direction: column;
          border: 1px dashed #999;
          overflow: hidden;
        }
        .etiqueta-vazia { border: none; }
        .cab-logo-wrap { text-align: center; padding: 3mm 3mm 2mm; }
        .cab-logo { height: 14mm; width: auto; }
        .cab-barra { height: 1.2mm; background: linear-gradient(90deg, #344d95, #5b78bd); }
        .miolo { padding: 2mm 3mm 0; display: flex; flex-direction: column; flex: 1; }
        .remetente {
          font-size: 7px;
          line-height: 1.3;
          color: #344d95;
          border-bottom: 1px dashed #344d95;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }
        .remetente .rot { font-weight: 700; letter-spacing: 0.04em; }
        .destinatario { flex: 1; }
        .destinatario .rot {
          font-size: 8px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
          margin-bottom: 3px; color: #344d95;
        }
        .destinatario .nome { font-size: 13px; font-weight: 700; line-height: 1.2; margin-bottom: 5px; }
        .destinatario .unidade { font-size: 10px; font-weight: 600; margin-bottom: 5px; }
        .destinatario .endereco { font-size: 10px; line-height: 1.4; }
        .rodape {
          border-top: 1.5px solid #344d95;
          padding-top: 5px;
          margin-top: 6px;
          padding-bottom: 3mm;
        }
        .rodape .os {
          font-family: 'Courier New', monospace;
          font-size: 15px;
          font-weight: 700;
          border: 1.5px solid #344d95;
          color: #000;
          text-align: center;
          padding: 4px;
          letter-spacing: 0.04em;
        }
        .rodape .equip { font-size: 8px; margin-top: 4px; text-align: center; }
        @media print {
          @page { size: A4; margin: 0; }
          body { background: #fff; }
          .acoes { display: none; }
          .folha { margin: 0; page-break-after: always; width: 100%; height: 100vh; }
          .folha:last-child { page-break-after: auto; }
        }
      </style>
    </head>
    <body>
      <div class="acoes">
        <button onclick="window.print()">Imprimir ${lista.length} etiqueta${lista.length > 1 ? 's' : ''} (${folhas.length} folha${folhas.length > 1 ? 's' : ''} A4)</button>
      </div>
      ${folhasHtml}
    </body>
    </html>
  `);
  janela.document.close();
}
