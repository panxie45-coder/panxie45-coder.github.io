import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const cdnBasePath = process.env.CDN_BASE_PATH ?? "";
const isStaticExport = isGitHubPages || Boolean(cdnBasePath);
const pagesBasePath =
  cdnBasePath ||
  (isGitHubPages && repositoryName && !repositoryName.endsWith(".github.io")
    ? `/${repositoryName}`
    : "");

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
        basePath: pagesBasePath,
        assetPrefix: pagesBasePath || undefined,
        typescript: { tsconfigPath: "tsconfig.pages.json" },
      }
    : {}),
};

export default nextConfig;
