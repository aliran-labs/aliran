/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile our workspace TS packages (they ship raw .ts via the "main" field).
  transpilePackages: ['@aliran/core', '@aliran/delegation', '@aliran/agents'],
};

export default nextConfig;
