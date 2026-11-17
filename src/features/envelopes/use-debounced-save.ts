"use client";
// Salvamento automático dos editores do rascunho (épicos 8.2 e 8.3).
import { useCallback, useRef, useState } from "react";
import { AUTOSAVE_MS } from "@/lib/limits";

export type SaveState = "idle" | "saving" | "saved" | "error";

// Grava com debounce e em fila: as gravações saem uma depois da outra, na ordem em que foram
// pedidas, então uma resposta lenta nunca deixa no servidor um valor mais antigo que o último
// (achado do verifier no 8.2). Devolve: agendar, gravar já (flush), desmarcar ("o que está na
// tela ainda não foi salvo") e o estado da última gravação pedida.
export function useDebouncedSave<T>(save: (value: T) => Promise<boolean>) {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const schedule = useCallback(
    (value: T) => {
      if (timer.current) clearTimeout(timer.current);
      const mine = ++generation.current;
      setState("saving");
      timer.current = setTimeout(() => {
        queue.current = queue.current.then(async () => {
          // Se outra gravação foi pedida depois desta, esta nem sai: a mais nova vale.
          if (mine !== generation.current) return;
          const ok = await save(value).catch(() => false);
          if (mine === generation.current) setState(ok ? "saved" : "error");
        });
      }, AUTOSAVE_MS);
    },
    [save],
  );
  // Grava já, na mesma fila (depois de qualquer gravação em andamento), e devolve se o servidor
  // confirmou. Usado por "Salvar e revisar": nunca corre em paralelo com o salvamento automático
  // e, se falhar, o estado vira "error" e a tela mostra a mensagem (achado do verifier no 8.3).
  const flush = useCallback(
    (value: T): Promise<boolean> => {
      if (timer.current) clearTimeout(timer.current);
      const mine = ++generation.current;
      setState("saving");
      const run = queue.current.then(async () => {
        const ok = await save(value).catch(() => false);
        if (mine === generation.current) setState(ok ? "saved" : "error");
        return ok;
      });
      queue.current = run;
      return run;
    },
    [save],
  );
  // A tela mudou para algo que não pode ser gravado: cancela o pendente e tira o "salvo".
  const invalidate = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    generation.current++;
    setState("idle");
  }, []);
  return { state, schedule, flush, invalidate };
}
