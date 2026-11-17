// [Público] Verificar por código — critério 8.8. O QR do manifesto aponta para cá. Mostra o
// resumo da regra 11.11 (ou "não encontrado") e o caminho para verificar outro documento.
// Fora do índice dos buscadores (seção 17: só /verificar é indexável).
import Link from "next/link";
import { Suspense } from "react";
import { VerifyResult } from "@/features/verify/components/verify-result";
import styles from "@/features/verify/components/verify.module.css";
import { copy } from "@/lib/copy";
import { normalizeVerificationCode } from "@/lib/verification-code";
import { verifyDocument, type VerificationResult } from "@/server/verification/lookup";

type Props = PageProps<"/verificar/[codigo]">;

export const metadata = { title: `${copy.verify.title} · ${copy.appName}` };

// Decodifica o segmento sem lançar (um "%" solto viraria página de erro).
function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function Result({ params }: Props) {
  const codigo = normalizeVerificationCode(decode((await params).codigo));
  // Formato inválido (com U, tamanho errado) não é "não encontrado": é código errado.
  if (!codigo) return <p className={`${styles.headline} ${styles.none}`}>{copy.verify.codeInvalid}</p>;
  const result: VerificationResult = await verifyDocument({ codigo });
  return <VerifyResult result={result} />;
}

export default function VerificarCodigoPage(props: Props) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <p className={styles.brand}>{copy.appName}</p>
        <h1 className={styles.title}>{copy.verify.title}</h1>
        <Suspense fallback={<div className={styles.card} aria-busy="true" />}>
          <Result {...props} />
        </Suspense>
        <Link className={styles.secondary} href="/verificar">
          {copy.verify.again}
        </Link>
      </div>
    </main>
  );
}
