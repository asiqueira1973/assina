// /sitemap.xml — seção 17: as cinco páginas indexáveis, com o endereço de NEXT_PUBLIC_SITE_URL.
import type { MetadataRoute } from "next";

const INDEXABLE_PATHS = ["/", "/verificar", "/docs/api", "/privacidade", "/termos"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://assina.app.br";
  return INDEXABLE_PATHS.map((path) => ({ url: `${site}${path === "/" ? "" : path}` }));
}
