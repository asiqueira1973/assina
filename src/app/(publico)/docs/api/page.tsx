// [Público] Documentação da API — critério 8.9: o OpenAPI 3.1 (/api/v1/openapi.json) mostrado
// legível, com os exemplos (fluxo por curl e verificação do webhook em Node). Indexável (seção 17).
import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/features/docs/docs.module.css";
import { CURL_FLOW, NODE_WEBHOOK } from "@/features/docs/examples";
import { copy } from "@/lib/copy";
import { openApiDocument } from "@/server/api/openapi";

export const metadata: Metadata = {
  title: `${copy.docs.title} · ${copy.appName}`,
  description: copy.docs.intro,
  robots: { index: true, follow: true },
};

type Op = { summary?: string; description?: string; parameters?: { name: string; in: string; required?: boolean }[]; requestBody?: { content?: Record<string, { example?: unknown }> }; responses: Record<string, { description: string }> };
const METHODS = ["get", "post", "delete"] as const;

export default function DocsApiPage() {
  const doc = openApiDocument();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://assina.app.br";
  const paths = doc.paths as unknown as Record<string, Partial<Record<(typeof METHODS)[number], Op>>>;
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <p className={styles.brand}>{copy.appName}</p>
        <h1 className={styles.title}>{copy.docs.title}</h1>
        <p className={styles.intro}>{copy.docs.intro}</p>
        <p className={styles.links}>
          <a href="/api/v1/openapi.json">{copy.docs.openapi}</a> · <Link href="/painel/integracoes">{copy.docs.getKey}</Link>
        </p>

        <h2 className={styles.h2}>{copy.docs.auth}</h2>
        <p>{copy.docs.authText}</p>
        <pre className={styles.code}>
          <code>{`Authorization: Bearer assina_…`}</code>
        </pre>

        <h2 className={styles.h2}>{copy.docs.flow}</h2>
        <pre className={styles.code}>
          <code>{CURL_FLOW(site)}</code>
        </pre>

        <h2 className={styles.h2}>{copy.docs.endpoints}</h2>
        {Object.entries(paths).flatMap(([path, item]) =>
          METHODS.filter((m) => item[m]).map((m) => {
            const op = item[m]!;
            const example = op.requestBody?.content?.["application/json"]?.example;
            return (
              <section key={`${m} ${path}`} className={styles.endpoint}>
                <h3 className={styles.h3}>
                  <span className={`${styles.method} ${styles[m]}`}>{m.toUpperCase()}</span>
                  <code>/api/v1{path}</code>
                </h3>
                {op.summary ? <p className={styles.summary}>{op.summary}</p> : null}
                {op.description ? <p>{op.description}</p> : null}
                {example ? (
                  <pre className={styles.code}>
                    <code>{JSON.stringify(example, null, 2)}</code>
                  </pre>
                ) : null}
                <ul className={styles.responses}>
                  {Object.entries(op.responses).map(([code, r]) => (
                    <li key={code}>
                      <code>{code}</code> {r.description}
                    </li>
                  ))}
                </ul>
              </section>
            );
          }),
        )}

        <h2 className={styles.h2}>{copy.docs.errors}</h2>
        <p>{copy.docs.errorsText}</p>
        <ul className={styles.responses}>
          {Object.entries(copy.api.errors).map(([code, msg]) => (
            <li key={code}>
              <code>{code}</code> {msg}
            </li>
          ))}
        </ul>

        <h2 className={styles.h2}>{copy.docs.webhooks}</h2>
        <p>{copy.docs.webhooksText}</p>
        <pre className={styles.code}>
          <code>{NODE_WEBHOOK}</code>
        </pre>
      </div>
    </main>
  );
}
