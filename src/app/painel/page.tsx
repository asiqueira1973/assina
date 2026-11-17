// [Remetente] Envelopes — seção 10 e critério 8.7. Uso do nível no topo (regra 11.20); filtros
// da seção 15 em pílulas; busca por título ou e-mail num formulário GET (funciona sem JS);
// cartões da seção 16 com "{n} de {m} assinaram" e a data; paginação de 30 em 30; esqueleto com
// a forma da lista enquanto carrega; estados vazios por filtro. Tudo lido no servidor.
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { StatusPill } from "@/features/envelopes/components/status-pill";
import { UsageLine } from "@/features/envelopes/components/usage-line";
import list from "@/features/envelopes/components/list.module.css";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { FILTERS, listEnvelopes, type EnvelopeListRow, type Filter } from "@/server/envelopes/manage";
import { getUsage } from "@/server/envelopes/usage";
import { copy } from "@/lib/copy";
import { formatDateShort } from "@/lib/format";
import { BUSCA_MAX } from "@/lib/limits";
import styles from "./painel.module.css";

// Página do painel: depende da sessão, fica fora da validação de navegação instantânea (ver o
// comentário em src/app/painel/layout.tsx e a pegadinha no CLAUDE.md).
export const instant = false;

type Query = { filtro: Filter; q: string; pagina: number };

// Lê ?filtro=&q=&pagina= sem confiar: filtro desconhecido vira "todos"; busca cortada.
function parseQuery(sp: Record<string, string | string[] | undefined>): Query {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filtro = (FILTERS as readonly string[]).includes(one(sp.filtro)) ? (one(sp.filtro) as Filter) : "todos";
  return { filtro, q: one(sp.q).trim().slice(0, BUSCA_MAX), pagina: Math.max(1, parseInt(one(sp.pagina), 10) || 1) };
}

// Monta o href da lista mantendo o que não muda.
function href(q: Query, change: Partial<Query>): string {
  const next = { ...q, ...change };
  const params = new URLSearchParams();
  if (next.filtro !== "todos") params.set("filtro", next.filtro);
  if (next.q) params.set("q", next.q);
  if (next.pagina > 1) params.set("pagina", String(next.pagina));
  const s = params.toString();
  return s ? `/painel?${s}` : "/painel";
}

const shortDate = formatDateShort;

// Linha secundária do cartão: progresso (se já enviado) e a data.
function meta(r: EnvelopeListRow): string {
  if (r.status === "rascunho") return copy.envelopes.createdOn(shortDate(r.criado_em));
  return `${copy.envelopes.progress(r.assinaram, r.assinantes)} · ${copy.envelopes.sentOn(shortDate(r.enviado_em ?? r.criado_em))}`;
}

// Uso do nível da conta (regra 11.20), lido do servidor.
async function Usage() {
  const account = await getCurrentAccount();
  if (!account) return null;
  return <UsageLine usage={await getUsage(account.id, account.nivel)} />;
}

async function Rows({ query }: { query: Query }) {
  const account = await getCurrentAccount();
  if (!account) return null;
  const { rows, pagina, paginas, total } = await listEnvelopes(account.id, { filtro: query.filtro, busca: query.q, pagina: query.pagina });
  if (!total) {
    const firstEver = query.filtro === "todos" && !query.q;
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>{firstEver ? copy.envelopes.emptyAll : copy.envelopes.emptyFilter}</p>
        {firstEver ? (
          <Link className={styles.emptyAction} href="/painel/envelopes/novo">
            {copy.envelopes.emptyAllAction}
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <>
      <ul className={list.list}>
        {rows.map((r) => (
          <li key={r.id}>
            <Link className={list.row} href={`/painel/envelopes/${r.id}`}>
              <div className={list.rowText}>
                <p className={list.rowTitle}>{r.titulo}</p>
                <p className={list.rowMeta}>{meta(r)}</p>
              </div>
              <StatusPill status={r.status} />
              <span className={list.open}>
                {copy.envelopes.open}
                <ChevronRight size={16} aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {paginas > 1 ? (
        <nav className={list.pager} aria-label={copy.envelopes.pageOf(pagina, paginas)}>
          <Link className={`${list.pagerLink} ${pagina <= 1 ? list.pagerOff : ""}`} href={href(query, { pagina: pagina - 1 })} aria-hidden={pagina <= 1} tabIndex={pagina <= 1 ? -1 : undefined}>
            {copy.envelopes.previous}
          </Link>
          <span>{copy.envelopes.pageOf(pagina, paginas)}</span>
          <Link className={`${list.pagerLink} ${pagina >= paginas ? list.pagerOff : ""}`} href={href(query, { pagina: pagina + 1 })} aria-hidden={pagina >= paginas} tabIndex={pagina >= paginas ? -1 : undefined}>
            {copy.envelopes.next}
          </Link>
        </nav>
      ) : null}
    </>
  );
}

function Skeleton() {
  return (
    <ul className={list.list} aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className={list.skeleton} />
      ))}
    </ul>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/painel">["searchParams"] }) {
  const sp = await searchParams;
  const query = parseQuery(sp);
  return (
    <>
      {sp.excluido ? <p className={list.flash} role="status">{copy.envelopes.deleted}</p> : null}
      <div className={list.toolbar}>
        <nav className={list.filters} aria-label={copy.envelopes.filtersLabel}>
          {FILTERS.map((f) => (
            <Link key={f} className={`${list.filter} ${f === query.filtro ? list.filterActive : ""}`} href={href(query, { filtro: f, pagina: 1 })} aria-current={f === query.filtro ? "page" : undefined}>
              {copy.envelopes.filters[f]}
            </Link>
          ))}
        </nav>
        <form className={list.search} action="/painel" role="search">
          {query.filtro !== "todos" ? <input type="hidden" name="filtro" value={query.filtro} /> : null}
          <input className={list.searchInput} type="search" name="q" defaultValue={query.q} maxLength={BUSCA_MAX} placeholder={copy.envelopes.search} aria-label={copy.envelopes.search} />
          <button className={list.searchButton} type="submit">
            {copy.envelopes.searchButton}
          </button>
        </form>
      </div>
      <Suspense key={href(query, {})} fallback={<Skeleton />}>
        <Rows query={query} />
      </Suspense>
    </>
  );
}

export default function EnvelopesPage({ searchParams }: PageProps<"/painel">) {
  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{copy.envelopes.title}</h1>
        <Link className={styles.primaryButton} href="/painel/envelopes/novo">
          <Plus size={18} strokeWidth={2.25} aria-hidden="true" />
          {copy.envelopes.newButton}
        </Link>
      </div>
      <Suspense fallback={null}>
        <Usage />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}
