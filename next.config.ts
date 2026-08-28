import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O container da VPS precisa do runtime isolado. Na Vercel, o build padrão
  // é necessário para que o hook de empacotamento gere os artefatos esperados.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
