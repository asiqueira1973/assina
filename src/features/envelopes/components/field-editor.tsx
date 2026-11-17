"use client";
// Editor de campos — épico 8.3 e regra 11.3.
// - As páginas do PDF são desenhadas pelo pdf.js num <canvas> do tamanho da coluna; cada página
//   tem a proporção da página real (aspect-ratio), e os campos ficam por cima em PORCENTAGEM:
//   reabrir em outra largura mostra tudo no mesmo lugar relativo.
// - Campo novo: arrastar o tipo para a página (cai onde soltou) ou clicar no tipo (cai no centro
//   da página à vista). Mover e redimensionar com o ponteiro; Tab entre campos, setas movem 1%,
//   Shift + setas redimensionam, Delete apaga. Sempre empurrado para dentro (clampField).
// - Cada mudança terminada é gravada com salvamento automático em fila (PUT da lista inteira).
//   "Salvar e revisar" grava na hora e só avança se o servidor confirmou.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { copy } from "@/lib/copy";
import { FIELD_TYPES, canBeOptional, clampField, defaultFieldSize, signerColor, type Box, type FieldType } from "@/lib/fields";
import { MAX_CAMPOS_POR_ASSINANTE, PASSO_TECLADO } from "@/lib/limits";
import { useDebouncedSave } from "../use-debounced-save";
import styles from "./fields.module.css";

type PageSize = { l: number; a: number };
type Signer = { id: string; nome: string };
export type EditorField = Box & {
  key: string;
  signatario_id: string;
  tipo: FieldType;
  pagina: number;
  obrigatorio: boolean;
  rotulo: string;
};

type Props = {
  envelopeId: string;
  title: string;
  pdfUrl: string;
  pages: PageSize[];
  signers: Signer[];
  initialFields: EditorField[];
};

const DRAG_TYPE = "application/x-assina-campo";

// Ordem de leitura de uma página (de cima para baixo, da esquerda para a direita): é a ordem do
// Tab entre os campos (critério 8.3).
function sortForReading(list: EditorField[]): EditorField[] {
  return [...list].sort((a, b) => a.y - b.y || a.x - b.x);
}

// Monta o corpo do PUT a partir do estado da tela (rótulo só em texto e caixa).
function toPayload(fields: EditorField[]) {
  return fields.map(({ signatario_id, tipo, pagina, x, y, largura, altura, obrigatorio, rotulo }) => ({
    signatario_id,
    tipo,
    pagina,
    x,
    y,
    largura,
    altura,
    obrigatorio: canBeOptional(tipo) ? obrigatorio : true,
    rotulo: canBeOptional(tipo) && rotulo.trim() ? rotulo.trim() : null,
  }));
}

export function FieldEditor({ envelopeId, title, pdfUrl, pages, signers, initialFields }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState<EditorField[]>(initialFields);
  const fieldsRef = useRef(fields);
  const [selectedSigner, setSelectedSigner] = useState(signers[0].id);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const signerIndex = new Map(signers.map((s, i) => [s.id, i]));
  const signerName = new Map(signers.map((s) => [s.id, s.nome]));

  const save = useCallback(
    async (list: EditorField[]) => {
      const res = await fetch(`/api/painel/envelopes/${envelopeId}/campos`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campos: toPayload(list) }),
      });
      return res.ok;
    },
    [envelopeId],
  );
  const autosave = useDebouncedSave(save);

  // Atualiza a tela; com commit, agenda a gravação (o movimento do ponteiro só grava ao soltar).
  const apply = useCallback(
    (next: EditorField[], commit: boolean) => {
      fieldsRef.current = next;
      setFields(next);
      if (commit) autosave.schedule(next);
    },
    [autosave],
  );

  // Abre o PDF com o pdf.js (só no navegador; o worker vem de /pdf.worker.min.mjs). No celular o
  // editor não aparece (critério 8.3), então nem baixa o documento. Ao sair da tela, destrói a
  // tarefa de carregamento (que libera o documento e o worker mesmo se ainda não terminou).
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) return;
    let cancelled = false;
    let task: { promise: Promise<unknown>; destroy(): Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (cancelled) return;
        task = pdfjs.getDocument({ url: pdfUrl });
        const loaded = (await task.promise) as PdfDoc;
        if (!cancelled) setPdf(loaded);
      } catch {
        if (!cancelled) setPdfFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [pdfUrl]);

  // Limpa um arrasto em andamento se a tela sair no meio dele.
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanup.current?.(), []);

  // Leva o foco a um campo recém-criado (pela paleta) ou ao vizinho de um apagado.
  const focusKey = useRef<string | null>(null);
  const setFocusKey = (key: string) => {
    focusKey.current = key;
  };
  useEffect(() => {
    if (!focusKey.current) return;
    document.querySelector<HTMLElement>(`[data-field-key="${focusKey.current}"]`)?.focus();
    focusKey.current = null;
  }, [fields]);

  // Página atual = a que cruza o meio da tela (o clique na paleta põe o campo nela). Conta direta
  // na rolagem; um IntersectionObserver com margem marcava as duas páginas como "visíveis".
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const middle = window.innerHeight / 2;
      for (const el of document.querySelectorAll<HTMLElement>("[data-page]")) {
        const r = el.getBoundingClientRect();
        if (r.top <= middle && r.bottom >= middle) {
          setCurrentPage(Number(el.dataset.page));
          return;
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const countFor = (signerId: string) => fields.filter((f) => f.signatario_id === signerId).length;
  const canAdd = countFor(selectedSigner) < MAX_CAMPOS_POR_ASSINANTE;

  // Cria um campo do assinante selecionado, centrado no ponto (em fração da página).
  function addField(tipo: FieldType, pagina: number, cx: number, cy: number) {
    if (!canAdd) return;
    const size = defaultFieldSize(tipo, pages[pagina - 1]);
    const box = clampField({ x: cx - size.largura / 2, y: cy - size.altura / 2, ...size });
    const field: EditorField = { key: crypto.randomUUID(), signatario_id: selectedSigner, tipo, pagina, ...box, obrigatorio: true, rotulo: "" };
    apply([...fieldsRef.current, field], true);
    setSelectedField(field.key);
    setFocusKey(field.key);
  }

  function updateField(key: string, patch: Partial<EditorField>, commit: boolean) {
    apply(
      fieldsRef.current.map((f) => {
        if (f.key !== key) return f;
        const next = { ...f, ...patch };
        return { ...next, ...clampField(next) };
      }),
      commit,
    );
  }

  // Apaga o campo e leva o foco ao próximo da mesma página, na ordem de leitura (ou ao anterior).
  function removeField(key: string) {
    const removed = fieldsRef.current.find((f) => f.key === key);
    const next = fieldsRef.current.filter((f) => f.key !== key);
    apply(next, true);
    setSelectedField(null);
    if (removed) {
      const samePage = sortForReading(next.filter((f) => f.pagina === removed.pagina));
      const after = samePage.find((f) => f.y > removed.y || (f.y === removed.y && f.x > removed.x)) ?? samePage.at(-1);
      if (after) setFocusKey(after.key);
    }
  }

  // Mover ou redimensionar com o ponteiro. A posição é recalculada em fração da página a cada
  // movimento; a gravação só sai ao soltar.
  function startPointer(e: React.PointerEvent, field: EditorField, mode: "move" | "resize") {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pageEl = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-page]");
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const start = { px: e.clientX, py: e.clientY, x: field.x, y: field.y, largura: field.largura, altura: field.altura };
    setSelectedField(field.key);
    (e.currentTarget as HTMLElement).focus();

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.px) / rect.width;
      const dy = (ev.clientY - start.py) / rect.height;
      updateField(
        field.key,
        mode === "move" ? { x: start.x + dx, y: start.y + dy } : { largura: start.largura + dx, altura: start.altura + dy },
        false,
      );
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      dragCleanup.current = null;
    };
    // Soltar ou cancelar (toque interrompido, caneta que sai da tela): para de seguir e grava.
    const onUp = () => {
      stop();
      autosave.schedule(fieldsRef.current);
    };
    dragCleanup.current = stop;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // Teclado (critério 8.3): setas movem 1%, Shift + setas redimensionam, Delete apaga.
  function onFieldKey(e: React.KeyboardEvent, field: EditorField) {
    const step = PASSO_TECLADO;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key in moves) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      updateField(field.key, e.shiftKey ? { largura: field.largura + dx, altura: field.altura + dy } : { x: field.x + dx, y: field.y + dy }, true);
      // A ordem de leitura pode mudar e o React mover o nó no DOM: devolve o foco ao campo.
      setFocusKey(field.key);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeField(field.key);
    } else if (e.key === "Escape") {
      setSelectedField(null);
    }
  }

  // "Salvar e revisar": grava agora pela mesma fila do salvamento automático (nunca em paralelo
  // com uma gravação em andamento) e só avança se o servidor confirmou; se falhar, a tela mostra
  // "Não consegui salvar. Tente de novo." e fica.
  async function saveAndReview() {
    setLeaving(true);
    const ok = await autosave.flush(fieldsRef.current);
    if (ok) router.push(`/painel/envelopes/${envelopeId}/revisar`);
    else setLeaving(false);
  }

  const selected = fields.find((f) => f.key === selectedField) ?? null;
  const saveText =
    autosave.state === "saving" ? copy.draft.saving : autosave.state === "saved" ? copy.draft.saved : autosave.state === "error" ? copy.draft.saveFailed : "";

  return (
    <>
      <div className={styles.mobileOnly}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.notice}>{copy.fields.useComputer}</p>
        <Link className={styles.primaryLink} href={`/painel/envelopes/${envelopeId}/revisar`}>
          {copy.draft.sendWithoutFields}
        </Link>
      </div>

      <div className={styles.editor} data-wide>
        <aside className={styles.left}>
          <h1 className={styles.title}>{title}</h1>
          <ul className={styles.signerList}>
            {signers.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`${styles.signerButton} ${s.id === selectedSigner ? styles.signerActive : ""}`}
                  aria-pressed={s.id === selectedSigner}
                  onClick={() => setSelectedSigner(s.id)}
                >
                  <span className={styles.dot} style={{ background: signerColor(i) }} aria-hidden="true" />
                  <span className={styles.signerName}>{s.nome}</span>
                  <span className={styles.count}>{countFor(s.id)}</span>
                </button>
              </li>
            ))}
          </ul>
          <h2 className={styles.paletteTitle}>{copy.fields.signerFields(signerName.get(selectedSigner) ?? "")}</h2>
          <div className={styles.palette}>
            {FIELD_TYPES.map((tipo) => (
              <button
                key={tipo}
                type="button"
                className={styles.paletteItem}
                draggable={canAdd}
                disabled={!canAdd}
                style={{ borderColor: signerColor(signerIndex.get(selectedSigner) ?? 0) }}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, tipo);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => addField(tipo, currentPage, 0.5, 0.5)}
              >
                {copy.fields.types[tipo]}
              </button>
            ))}
          </div>
          <p className={styles.howTo}>{copy.fields.howTo}</p>
          <p id="ajuda-teclado-campos" className={styles.howTo}>
            {copy.fields.keyboardHelp}
          </p>
        </aside>

        <div className={styles.pages}>
          {pdfFailed ? (
            <div className={styles.error} role="alert">
              <span>{copy.fields.loadFailed}</span>
              {/* Recarrega a página do servidor: vem uma URL assinada nova (a anterior vale 5 min). */}
              <button type="button" className={styles.retryButton} onClick={() => {
                  setPdfFailed(false);
                  router.refresh();
                }}>
                {copy.fields.retry}
              </button>
            </div>
          ) : null}
          {pages.map((size, i) => {
            const pagina = i + 1;
            return (
              <section key={pagina} className={styles.pageBlock} aria-label={copy.fields.pageOf(pagina, pages.length)}>
                <div
                  className={styles.page}
                  data-page={pagina}
                  style={{ aspectRatio: `${size.l} / ${size.a}` }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    const tipo = e.dataTransfer.getData(DRAG_TYPE) as FieldType;
                    if (!FIELD_TYPES.includes(tipo)) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    addField(tipo, pagina, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
                  }}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "CANVAS") setSelectedField(null);
                  }}
                >
                  <PdfPageCanvas pdf={pdf} pageNumber={pagina} />
                  {!pdf && !pdfFailed ? <span className={styles.loading}>{copy.fields.loading}</span> : null}
                  {sortForReading(fields.filter((f) => f.pagina === pagina)).map((f) => {
                      const color = signerColor(signerIndex.get(f.signatario_id) ?? 0);
                      const isSelected = f.key === selectedField;
                      return (
                        <div
                          key={f.key}
                          data-field-key={f.key}
                          role="button"
                          tabIndex={0}
                          aria-describedby="ajuda-teclado-campos"
                          aria-label={`${copy.fields.types[f.tipo]} · ${signerName.get(f.signatario_id) ?? ""}`}
                          aria-pressed={isSelected}
                          className={`${styles.field} ${isSelected ? styles.fieldSelected : ""}`}
                          style={{
                            left: `${f.x * 100}%`,
                            top: `${f.y * 100}%`,
                            width: `${f.largura * 100}%`,
                            height: `${f.altura * 100}%`,
                            borderColor: color,
                            background: `color-mix(in srgb, ${color} 16%, transparent)`,
                          }}
                          onPointerDown={(e) => startPointer(e, f, "move")}
                          onFocus={() => setSelectedField(f.key)}
                          onKeyDown={(e) => onFieldKey(e, f)}
                        >
                          <span className={styles.fieldLabel}>{f.tipo === "caixa" ? "" : f.rotulo || copy.fields.types[f.tipo]}</span>
                          {isSelected ? (
                            <span
                              className={styles.handle}
                              style={{ background: color }}
                              onPointerDown={(e) => startPointer(e, f, "resize")}
                              aria-hidden="true"
                            />
                          ) : null}
                        </div>
                      );
                  })}
                </div>
                <p className={styles.pageNumber}>{copy.fields.pageOf(pagina, pages.length)}</p>
              </section>
            );
          })}
        </div>

        <aside className={styles.right}>
          {selected ? (
            <div className={styles.props}>
              <p className={styles.propsTitle}>{copy.fields.types[selected.tipo]}</p>
              <p className={styles.propsSigner}>{signerName.get(selected.signatario_id)}</p>
              {canBeOptional(selected.tipo) ? (
                <>
                  <label className={styles.toggle}>
                    <input type="checkbox" checked={selected.obrigatorio} onChange={(e) => updateField(selected.key, { obrigatorio: e.target.checked }, true)} />
                    {copy.fields.required}
                  </label>
                  <label className={styles.propField}>
                    <span>{copy.fields.hint}</span>
                    <input value={selected.rotulo} maxLength={60} onChange={(e) => updateField(selected.key, { rotulo: e.target.value }, true)} />
                  </label>
                </>
              ) : null}
              <button type="button" className={styles.removeButton} onClick={() => removeField(selected.key)}>
                <Trash2 size={16} aria-hidden="true" />
                {copy.draft.remove}
              </button>
            </div>
          ) : null}
        </aside>
      </div>

      <div className={styles.footer}>
        <span className={`${styles.saveStatus} ${autosave.state === "error" ? styles.saveError : ""}`} role="status">
          {saveText}
        </span>
        <Link className={styles.secondaryLink} href={`/painel/envelopes/${envelopeId}/editar`}>
          {copy.fields.back}
        </Link>
        <button type="button" className={styles.primaryButton} disabled={leaving} onClick={saveAndReview}>
          {copy.fields.saveAndReview}
        </button>
      </div>
    </>
  );
}

// Tipos mínimos do pdf.js usados aqui (o módulo só é carregado no navegador).
type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};
type PdfPage = {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }): { promise: Promise<void>; cancel(): void };
};

// Desenha uma página quando ela chega perto da tela, na largura atual da coluna (e de novo se a
// largura mudar).
function PdfPageCanvas({ pdf, pageNumber }: { pdf: PdfDoc | null; pageNumber: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = canvas.current?.parentElement;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    // Largura arredondada de 40 em 40 px: não redesenha a cada pixel de redimensionamento.
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width / 40) * 40));
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!pdf || !near || !width || !canvas.current) return;
    let task: { promise: Promise<void>; cancel(): void } | null = null;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width * (window.devicePixelRatio || 1)) / base.width });
      canvas.current.width = Math.floor(viewport.width);
      canvas.current.height = Math.floor(viewport.height);
      task = page.render({ canvas: canvas.current, viewport });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, near, width, pageNumber]);

  return <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />;
}
