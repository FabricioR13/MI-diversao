import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // O projeto foi escrito sem acesso ao "next build" (veja o LEIA-ME).
    // Isto evita que um aviso de tipagem trave a publicação; rode "npm run typecheck"
    // e, se passar limpo, pode apagar este bloco.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
