// [Remetente] Autorizar conexão — seção 6.4 passo 4 e critério 8.10. Exige sessão (sem ela, vai
// para /entrar e volta para cá). Mostra o nome do cliente e o que ele poderá e não poderá fazer
// (seção 15). "Permitir" e "Cancelar" enviam o formulário para /oauth/autorizar/decidir, que confere
// tudo de novo. Qualquer pedido inválido → tela de erro, sem redirecionar (nunca um redirecionador
// aberto). O consentimento mostra o host de volta, além do nome que o cliente deu a si mesmo.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import styles from "@/features/oauth/oauth.module.css";
import { copy } from "@/lib/copy";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { checkAuthorizeParams, redirectHost } from "@/server/oauth/authorize";

// Lê a sessão: fora da validação de navegação instantânea (CLAUDE.md, pegadinhas).
export const instant = false;

type Props = PageProps<"/oauth/autorizar">;
const PARAMS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state"] as const;

async function Consent({ searchParams }: Props) {
  const sp = await searchParams;
  const p = Object.fromEntries(PARAMS.map((k) => [k, typeof sp[k] === "string" ? (sp[k] as string) : undefined]));
  const check = await checkAuthorizeParams(p);
  if (!check.ok) {
    return (
      <div className={styles.card} role="alert">
        <p className={styles.brand}>{copy.appName}</p>
        <h1 className={styles.title}>{copy.oauth.invalidTitle}</h1>
        <p className={styles.muted}>{copy.oauth.invalidText}</p>
      </div>
    );
  }
  const account = await getCurrentAccount();
  if (!account) {
    const query = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();
    redirect(`/entrar?volta=${encodeURIComponent(`/oauth/autorizar?${query}`)}`);
  }
  return (
    <form className={styles.card} method="post" action="/oauth/autorizar/decidir">
      <p className={styles.brand}>{copy.appName}</p>
      <h1 className={styles.title}>{copy.oauth.title(check.req.client.nome)}</h1>
      <p className={styles.text}>{copy.oauth.can}</p>
      <p className={styles.text}>{copy.oauth.cannot}</p>
      <p className={styles.muted}>{copy.oauth.returnTo(redirectHost(check.req.redirectUri))}</p>
      <p className={styles.muted}>{copy.oauth.as(account.email)}</p>
      {PARAMS.map((k) => (p[k] ? <input key={k} type="hidden" name={k} value={p[k]} /> : null))}
      <div className={styles.buttons}>
        <button className={styles.secondary} type="submit" name="decisao" value="cancelar">
          {copy.oauth.cancel}
        </button>
        <button className={styles.primary} type="submit" name="decisao" value="permitir">
          {copy.oauth.allow}
        </button>
      </div>
    </form>
  );
}

export default function AutorizarPage(props: Props) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<div className={styles.card} aria-busy="true" />}>
        <Consent {...props} />
      </Suspense>
    </main>
  );
}
