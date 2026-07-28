// Porta fiel de validar_cnpj/formatar_cnpj em cadastros.py (linhas 26-51):
// mesmos pesos e regra de dígito verificador.
export function somenteDigitos(valor: string | undefined | null): string {
  return (valor ?? '').replace(/\D/g, '');
}

export function validarCnpj(cnpjEntrada: string): boolean {
  const cnpj = somenteDigitos(cnpjEntrada);
  if (cnpj.length !== 14 || cnpj === cnpj[0].repeat(14)) return false;

  function digitoVerificador(parcial: string): string {
    const pesosCompletos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesos = pesosCompletos.slice(pesosCompletos.length - parcial.length);
    const soma = parcial
      .split('')
      .reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? '0' : String(11 - resto);
  }

  const digito1 = digitoVerificador(cnpj.slice(0, 12));
  const digito2 = digitoVerificador(cnpj.slice(0, 12) + digito1);
  return cnpj.slice(-2) === digito1 + digito2;
}

export function formatarCnpj(cnpjEntrada: string): string {
  const d = somenteDigitos(cnpjEntrada);
  if (d.length !== 14) return cnpjEntrada;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}
