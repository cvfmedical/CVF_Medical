import { EMPRESA } from './formato';
import cvfLogoCompleto from '../assets/cvf-logo-completo.png';

// Etiqueta de despacho pra colar na caixa enviada ao cliente - formato de
// impressora térmica (100x150mm, padrão de etiqueta de envio 4x6").
// Layout deliberadamente simples (preto e branco, sem logo/fotos): é o que
// impressoras térmicas de etiqueta imprimem bem. Diferente de
// abrirImpressao() (lib/imprimir.ts), que é pro documento A4 completo.
export interface DadosEtiquetaDespacho {
  numeroOS: string;
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
      <title>Etiqueta - ${d.numeroOS}</title>
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
          <div class="rodape">
            <div class="os">OS ${d.numeroOS}</div>
            ${d.equipamento ? `<div class="equip">${d.equipamento}</div>` : ''}
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
  janela.document.close();
}
