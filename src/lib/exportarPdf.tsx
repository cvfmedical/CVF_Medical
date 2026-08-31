import { pdf } from '@react-pdf/renderer';
import { RelatorioTabelaPdf, type ColunaRelatorioPdf } from './RelatorioTabelaPdf';

export interface ExportarTabelaPdfOpcoes {
  titulo: string;
  subtitulo?: string;
  colunas: ColunaRelatorioPdf[];
  linhas: string[][];
  totalLabel?: string;
  totalValor?: string;
  nomeArquivo: string;
}

// Mesmo mecanismo de download direto no navegador já usado em
// exportarXlsx.ts (Blob + URL.createObjectURL + <a download> temporário),
// só que gerando PDF (react-pdf) em vez de planilha.
export async function exportarTabelaPdf(opcoes: ExportarTabelaPdfOpcoes) {
  const blob = await pdf(
    <RelatorioTabelaPdf
      titulo={opcoes.titulo}
      subtitulo={opcoes.subtitulo}
      colunas={opcoes.colunas}
      linhas={opcoes.linhas}
      totalLabel={opcoes.totalLabel}
      totalValor={opcoes.totalValor}
    />
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const nomeArquivo = opcoes.nomeArquivo.toLowerCase().endsWith('.pdf') ? opcoes.nomeArquivo : `${opcoes.nomeArquivo}.pdf`;
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
