// CPF — critério 8.5: validado pelos dígitos verificadores. Roda no cliente e no servidor.

// Tira tudo que não é dígito. Recebe: "529.982.247-25". Devolve: "52998224725".
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

// Diz se o CPF é válido (11 dígitos, não todos iguais, dígitos verificadores certos).
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}
