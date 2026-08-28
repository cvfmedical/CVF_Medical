// Cálculo simples de dia útil - pula sábado/domingo, sem calendário de
// feriados (mesma simplificação já aceita em outros prazos do sistema).
function ehDiaUtil(data: Date): boolean {
  const diaSemana = data.getDay();
  return diaSemana !== 0 && diaSemana !== 6;
}

// N-ésimo dia útil de um mês (ano/mes em base 1, ex.: mes=1 é janeiro).
export function nEsimoDiaUtil(ano: number, mes: number, n: number): Date {
  const data = new Date(ano, mes - 1, 1);
  let contados = 0;
  while (contados < n) {
    if (ehDiaUtil(data)) contados++;
    if (contados < n) data.setDate(data.getDate() + 1);
  }
  return data;
}

// 5º dia útil do mês seguinte a uma data - usado no faturamento diferido
// de peças (Grupo Cortical): a mão de obra é cobrada na hora, as peças só
// vencem no 5º dia útil do mês seguinte à emissão da NF de serviço.
export function quintoDiaUtilMesSeguinte(dataBase: Date): Date {
  const ano = dataBase.getMonth() === 11 ? dataBase.getFullYear() + 1 : dataBase.getFullYear();
  const mes = dataBase.getMonth() === 11 ? 1 : dataBase.getMonth() + 2;
  return nEsimoDiaUtil(ano, mes, 5);
}
