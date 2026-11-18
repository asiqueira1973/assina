"use client";
// Integrações, parte do MCP (critério 8.10): os dois caminhos ("Pelo aplicativo", com o endereço
// do /mcp; "Por arquivo", com o JSON copiável que usa a chave de API) e as conexões autorizadas
// (nome do cliente, criada em, último uso) com "Revogar". A lista é relida do servidor.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";
import styles from "./integrations.module.css";

const t = copy.mcp;
type Connection = { id: string; nome: string; criado_em: string; ultimo_uso_em: string | null };

function CopyBlock({ text }: { text: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <pre className={styles.value}>{text}</pre>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.button}
          onClick={async () => setMsg((await navigator.clipboard?.writeText(text).then(() => true, () => false)) ? copy.integrations.copied : null)}
        >
          {copy.integrations.copy}
        </button>
        {msg ? (
          <span className={styles.ok} role="status">
            {msg}
          </span>
        ) : null}
      </div>
    </>
  );
}

export function McpSection({ mcpUrl, connections }: { mcpUrl: string; connections: Connection[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"app" | "file">("app");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileJson = JSON.stringify({ mcpServers: { assina: { type: "http", url: mcpUrl, headers: { Authorization: "Bearer assina_…" } } } }, null, 2);

  async function revoke(id: string) {
    const res = await fetch(`/api/painel/integracoes/conexoes/${id}/revogar`, { method: "POST" }).catch(() => null);
    setMsg(res?.ok ? { text: t.revoked, ok: true } : { text: copy.errors.generic, ok: false });
    router.refresh();
  }

  return (
    <section className={styles.card} aria-labelledby="mcp-titulo">
      <h2 id="mcp-titulo" className={styles.heading}>
        {t.title}
      </h2>
      <div className={styles.row} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "app"} className={`${styles.button} ${tab === "app" ? styles.primary : ""}`} onClick={() => setTab("app")}>
          {t.byApp}
        </button>
        <button type="button" role="tab" aria-selected={tab === "file"} className={`${styles.button} ${tab === "file" ? styles.primary : ""}`} onClick={() => setTab("file")}>
          {t.byFile}
        </button>
      </div>
      {tab === "app" ? (
        <div role="tabpanel">
          <p className={styles.help}>{t.byAppText}</p>
          <CopyBlock text={mcpUrl} />
        </div>
      ) : (
        <div role="tabpanel">
          <p className={styles.help}>{t.byFileText}</p>
          <CopyBlock text={fileJson} />
        </div>
      )}

      <p className={styles.label}>{t.connections}</p>
      {connections.length ? (
        <ul className={styles.list}>
          {connections.map((c) => (
            <li key={c.id} className={styles.item}>
              <div>
                <p className={styles.itemName}>{c.nome}</p>
                <p className={styles.help}>
                  {t.createdAt(formatDateTime(c.criado_em))} · {c.ultimo_uso_em ? t.lastUse(formatDateTime(c.ultimo_uso_em)) : t.neverUsed}
                </p>
              </div>
              <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => revoke(c.id)}>
                {t.revoke}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.help}>{t.none}</p>
      )}
      {msg ? (
        <p className={msg.ok ? styles.ok : styles.error} role={msg.ok ? "status" : "alert"}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
