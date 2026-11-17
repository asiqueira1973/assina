"use client";
// Documento PDF no navegador (pdf.js) — usado pelo editor de campos (8.3) e pela página do
// signatário (8.5). O worker vem de /pdf.worker.min.mjs (scripts/copy-pdf-worker.mjs).
import { useEffect, useRef, useState } from "react";

// Tipos mínimos do pdf.js usados aqui (o módulo só é carregado no navegador).
export type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};
type PdfPage = {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }): { promise: Promise<void>; cancel(): void };
};

// Abre o documento. Ao sair da tela, destrói a tarefa de carregamento (libera documento e worker
// mesmo se ainda não terminou). Com skipOnMobile, abaixo de 768 px nem baixa (editor de campos).
// Devolve: o documento, se falhou e uma função para tentar de novo.
export function usePdfDocument(url: string | null, opts: { skipOnMobile?: boolean } = {}) {
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    if (opts.skipOnMobile && window.matchMedia("(max-width: 767px)").matches) return;
    let cancelled = false;
    let task: { promise: Promise<unknown>; destroy(): Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (cancelled) return;
        task = pdfjs.getDocument({ url });
        const loaded = (await task.promise) as PdfDoc;
        if (!cancelled) setPdf(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url, attempt, opts.skipOnMobile]);
  return {
    pdf,
    failed,
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    },
  };
}

// Desenha uma página quando ela chega perto da tela, na largura atual da coluna (e de novo se a
// largura mudar). onRendered avisa quando a página apareceu pela primeira vez.
export function PdfPageCanvas({ pdf, pageNumber, className, onRendered }: { pdf: PdfDoc | null; pageNumber: number; className?: string; onRendered?: () => void }) {
  const onRenderedRef = useRef(onRendered);
  useEffect(() => {
    onRenderedRef.current = onRendered;
  }, [onRendered]);
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
      const ok = await task.promise.then(() => true).catch(() => false);
      if (ok && !cancelled) onRenderedRef.current?.();
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, near, width, pageNumber]);

  return <canvas ref={canvas} className={className} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}
