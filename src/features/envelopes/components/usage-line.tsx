// Linha de uso do nível (regra 11.20): "{n} de {limite} documentos · Nível {n}", em laranja a
// partir de 80% do limite.
import { copy } from "@/lib/copy";
import { ALERTA_USO_NIVEL } from "@/lib/limits";
import type { Usage } from "@/server/envelopes/usage";
import styles from "./status.module.css";

export function UsageLine({ usage }: { usage: Usage }) {
  const alert = usage.used >= usage.limit * ALERTA_USO_NIVEL;
  return <p className={`${styles.usage} ${alert ? styles.usageAlert : ""}`}>{copy.usage(usage.used, usage.limit, usage.nivel)}</p>;
}
