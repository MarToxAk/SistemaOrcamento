"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { montarQuery } from "./filtros-url";

/** Le e grava filtros na query da URL atual sem recarregar nem rolar a pagina. */
export function useFiltrosUrl(): {
  obter: (chave: string) => string | null;
  definir: (alteracoes: Record<string, string | null | undefined>) => void;
} {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const obter = useCallback((chave: string) => searchParams.get(chave), [searchParams]);

  const definir = useCallback(
    (alteracoes: Record<string, string | null | undefined>) => {
      const query = montarQuery(searchParams.toString(), alteracoes);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  return { obter, definir };
}
