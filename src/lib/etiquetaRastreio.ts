import QRCode from 'qrcode';
import cvfLogoCompleto from '../assets/cvf-logo-completo.png';

// Etiqueta de rastreio pra colar no próprio equipamento (não na caixa de
// envio - essa é a etiquetaDespacho.ts) - fica com ele do Recebimento até a
// Entrega, com um QR Code que abre a tela /rastreio/:codigo (mostra a qual
// Entrada/OS/Orçamento ele pertence e o status atual). Tamanho pequeno
// (etiqueta de patrimônio, ~70x50mm), pensado pra impressora de etiqueta
// comum ou até folha A4 com várias por página.
export interface DadosEtiquetaRastreio {
  codigoEntrada: string;
  clienteNome: string;
  equipamento?: string | null;
}

export async function imprimirEtiquetaRastreio(d: DadosEtiquetaRastreio) {
  const url = `${window.location.origin}/rastreio/${encodeURIComponent(d.codigoEntrada)}`;
  let qrDataUrl: string;
  try {
    qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
  } catch {
    alert('Não foi possível gerar o QR Code da etiqueta.');
    return;
  }

  const janela = window.open('', '_blank', 'width=420,height=520');
  if (!janela) {
    alert('Não foi possível abrir a janela de impressão (verifique o bloqueador de pop-ups).');
    return;
  }

  janela.document.open();
  janela.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Etiqueta de rastreio - ${d.codigoEntrada}</title>
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
          width: 70mm;
          height: 50mm;
          margin: 12px auto;
          background: #fff;
          padding: 3mm;
          display: flex;
          gap: 3mm;
          border: 1px solid #999;
          overflow: hidden;
        }
        .qr { width: 22mm; height: 22mm; flex: none; }
        .miolo { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
        .logo { height: 6mm; width: auto; margin-bottom: 2mm; }
        .codigo {
          font-family: 'Courier New', monospace;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.03em;
        }
        .cliente { font-size: 10px; font-weight: 600; margin-top: 1.5mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .equip { font-size: 8.5px; color: #333; margin-top: 1mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media print {
          @page { size: 70mm 50mm; margin: 0; }
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
        <img class="qr" src="${qrDataUrl}" alt="QR Code" />
        <div class="miolo">
          <img class="logo" src="${cvfLogoCompleto}" alt="CVF Medical" />
          <div class="codigo">${d.codigoEntrada}</div>
          <div class="cliente">${d.clienteNome}</div>
          ${d.equipamento ? `<div class="equip">${d.equipamento}</div>` : ''}
        </div>
      </div>
    </body>
    </html>
  `);
  janela.document.close();
}
