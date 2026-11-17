"use client";
// Canvas para desenhar a assinatura — critério 8.5: largura toda, funciona com o dedo, e a
// rolagem da página trava enquanto se desenha (touch-action: none no canvas e captura do ponteiro).
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import styles from "./signing.module.css";

export type DrawPadHandle = { clear(): void; toPng(): string | null };

// Recebe: callback de "tem traço". Expõe: limpar e exportar PNG (null se vazio).
export const DrawPad = forwardRef<DrawPadHandle, { onInk: (has: boolean) => void; label: string }>(function DrawPad({ onInk, label }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hasInk = useRef(false);

  // Ajusta o canvas à largura e à densidade da tela (traço nítido) e prepara o pincel.
  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.floor(rect.width * ratio);
    c.height = Math.floor(rect.height * ratio);
    const g = c.getContext("2d")!;
    g.scale(ratio, ratio);
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#1d1d1f";
  }, []);

  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvas.current!;
      c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
      hasInk.current = false;
      onInk(false);
    },
    toPng() {
      return hasInk.current ? canvas.current!.toDataURL("image/png") : null;
    },
  }));

  // Desenha seguindo o ponteiro (mouse, dedo ou caneta).
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    c.setPointerCapture(e.pointerId);
    const g = c.getContext("2d")!;
    const r = c.getBoundingClientRect();
    g.beginPath();
    g.moveTo(e.clientX - r.left, e.clientY - r.top);
    const move = (ev: PointerEvent) => {
      g.lineTo(ev.clientX - r.left, ev.clientY - r.top);
      g.stroke();
      if (!hasInk.current) {
        hasInk.current = true;
        onInk(true);
      }
    };
    const up = () => {
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
    };
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
  }

  return <canvas ref={canvas} className={styles.drawPad} aria-label={label} onPointerDown={onPointerDown} />;
});
