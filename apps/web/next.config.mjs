// Export statique pour GitHub Pages. BASE_PATH = "/<nom-du-dépôt>" en production.
const basePath = process.env.BASE_PATH || "";
export default {
  transpilePackages: ["@marche-brief/core"],
  output: "export",
  // Dossier séparé : « npm run build » ne casse plus « npm run dev ».
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
  trailingSlash: true,
};
