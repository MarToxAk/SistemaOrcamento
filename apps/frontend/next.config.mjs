/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16 (dev) bloqueia hidratacao/HMR vindos de origens diferentes de localhost.
  // Libera o IP do servidor de desenvolvimento; nao afeta build de producao.
  allowedDevOrigins: ["72.60.253.108"],
};

export default nextConfig;
