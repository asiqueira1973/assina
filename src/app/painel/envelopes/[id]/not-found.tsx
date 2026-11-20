// [Remetente] Envelope que não existe ou é de outra conta (notFound() das páginas do envelope:
// detalhe, editar, campos e revisar). Mostra com qual e-mail a pessoa entrou, porque o caso comum
// é ter entrado com outra conta Google (achado em produção, 20/11/2026). Fica dentro do layout do
// painel, que já lê a sessão; sem conta, o layout manda para /entrar.
import Link from "next/link";
import { copy } from "@/lib/copy";
import { getCurrentAccount } from "@/server/auth/require-conta";
import panel from "../../painel.module.css";
import conta from "../../conta/conta.module.css";

export default async function EnvelopeNotFound() {
  const account = await getCurrentAccount();
  const t = copy.notFound;
  return (
    <>
      <div className={panel.pageHeader}>
        <h1 className={panel.pageTitle}>{t.envelopeTitle}</h1>
      </div>
      <div className={panel.empty}>
        {account ? <p className={panel.emptyText}>{t.envelopeText(account.email)}</p> : null}
        <Link className={panel.emptyAction} href="/painel">{t.envelopes}</Link>
        <form action="/sair" method="post">
          <button className={conta.signOut} type="submit">{copy.account.signOut}</button>
        </form>
      </div>
    </>
  );
}
