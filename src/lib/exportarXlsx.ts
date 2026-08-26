export interface LinhaRelatorioPecas {
  empresa: string;
  nf: string;
  osKit: string;
  numeroOrcamento: string;
  valorFixo: number | null;
  descricao: string;
  quantidade: number | null;
  valorUnitario: number | null;
  total: number | null;
}

// Gera e baixa o .xlsx do relatório de peças utilizadas, no mesmo layout
// da planilha de controle que o usuário mantinha à mão: título com o
// mês, duas faixas de cabeçalho ("Notas de serviço" / "Peças
// utilizadas") e uma linha de total ao final.
export async function exportarRelatorioPecasXlsx(tituloMes: string, linhas: LinhaRelatorioPecas[]) {
  // Import dinâmico: exceljs é uma biblioteca pesada (~1MB minificado) só
  // usada nessa exportação pontual - carregando sob demanda em vez de no
  // bundle principal, quem nunca usa esse relatório não paga esse peso.
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Peças utilizadas');

  ws.mergeCells('A1:I1');
  const tituloCel = ws.getCell('A1');
  tituloCel.value = `CONTROLE DE PEÇAS UTILIZADAS - ${tituloMes}`;
  tituloCel.font = { bold: true, size: 13 };
  tituloCel.alignment = { horizontal: 'center' };

  ws.mergeCells('A2:E2');
  ws.mergeCells('F2:I2');
  const notasCel = ws.getCell('A2');
  notasCel.value = 'NOTAS DE SERVIÇO';
  const pecasCel = ws.getCell('F2');
  pecasCel.value = 'PEÇAS UTILIZADAS';
  for (const c of [notasCel, pecasCel]) {
    c.font = { bold: true };
    c.alignment = { horizontal: 'center' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4E1D8' } };
  }

  const linhaCabecalho = ws.addRow(['EMPRESA', 'NF', 'OS/KIT', 'Nº ORÇ.', 'VALOR', 'DESCRIÇÃO', 'QTD', 'VALOR', 'TOTAL']);
  linhaCabecalho.font = { bold: true };

  let totalGeral = 0;
  for (const l of linhas) {
    ws.addRow([l.empresa, l.nf, l.osKit, l.numeroOrcamento, l.valorFixo, l.descricao, l.quantidade, l.valorUnitario, l.total]);
    totalGeral += l.total ?? 0;
  }

  const linhaTotal = ws.addRow(['TOTAL', '', '', '', '', '', '', '', totalGeral]);
  linhaTotal.font = { bold: true };

  ws.columns = [
    { width: 24 },
    { width: 10 },
    { width: 26 },
    { width: 14 },
    { width: 10 },
    { width: 28 },
    { width: 8 },
    { width: 12 },
    { width: 12 },
  ];
  ws.getColumn(5).numFmt = '#,##0.00';
  ws.getColumn(8).numFmt = '#,##0.00';
  ws.getColumn(9).numFmt = '#,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pecas-utilizadas-${tituloMes.replace('/', '-')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
