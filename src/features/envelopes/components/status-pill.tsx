// Pílula de status do envelope (seção 16): verde = concluído; laranja = aguardando; vermelho =
// recusado ou cancelado; cinza = rascunho ou expirado; neutro = finalizando.
import { copy } from "@/lib/copy";
import styles from "./status.module.css";

type Status = keyof typeof copy.status.envelope;

const TONE: Record<Status, string> = {
  rascunho: styles.gray,
  enviado: styles.orange,
  finalizando: styles.neutral,
  concluido: styles.green,
  recusado: styles.red,
  cancelado: styles.red,
  expirado: styles.gray,
};

export function StatusPill({ status }: { status: Status }) {
  return <span className={`${styles.pill} ${TONE[status]}`}>{copy.status.envelope[status]}</span>;
}
