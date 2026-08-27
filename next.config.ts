import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessário para o runtime isolado da VPS; a Vercel continua suportada.
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
