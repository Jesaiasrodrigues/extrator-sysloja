"use client";
import { useCallback, useEffect, useState } from "react";
import { RegraSalva } from "./regras";

export function useRegras() {
  const [regras, setRegras] = useState<RegraSalva[]>([]);
  const recarregar = useCallback(async () => {
    const r = await fetch("/api/regras", { cache: "no-store" });
    if (r.ok) setRegras(await r.json());
  }, []);
  useEffect(() => {
    recarregar();
  }, [recarregar]);
  return { regras, recarregar };
}
