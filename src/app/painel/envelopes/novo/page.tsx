// [Remetente] Novo envelope — épico 8.2, passos 1 a 3: escolher o PDF, subir com progresso e
// validar. Ao validar, segue para a edição do rascunho (/painel/envelopes/{id}/editar).
import { copy } from "@/lib/copy";
import { NewEnvelopeUpload } from "@/features/envelopes/components/new-envelope-upload";
import styles from "../../painel.module.css";
import draft from "@/features/envelopes/components/draft.module.css";

// Página do painel: fica fora da validação de navegação instantânea (CLAUDE.md, pegadinhas).
export const instant = false;

export default function NovoEnvelopePage() {
  return (
    <div className={draft.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{copy.draft.uploadTitle}</h1>
      </div>
      <NewEnvelopeUpload />
    </div>
  );
}
