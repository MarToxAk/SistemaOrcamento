"use client";

import Script from "next/script";

/**
 * Bootstrap 5.3.2 e bootstrap-icons 1.11.1 carregados do CDN, como no resumo de contas a receber.
 * Todo recurso externo leva SRI (sha384) e crossOrigin="anonymous": hashes recomputados em
 * 2026-11-22 e conferidos com o UI-SPEC (Registry Safety). O script de ícones em JavaScript
 * responde 404 no CDN e não é usado — os ícones são só CSS.
 */
export default function RecursosBootstrap() {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-C6RzsynM9kWDrMNeT87bh95OGNyZPhcTNXj1NW7RuBCsyN/o0jlpcV8Qyq46cDfL"
        crossOrigin="anonymous"
        strategy="beforeInteractive"
      />
      <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
        rel="stylesheet"
        integrity="sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN"
        crossOrigin="anonymous"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
        integrity="sha384-4LISF5TTJX/fLmGSxO53rV4miRxdg84mZsxmO8Rx5jGtp/LbrixFETvWa5a6sESd"
        crossOrigin="anonymous"
      />
    </>
  );
}

export { RecursosBootstrap };
