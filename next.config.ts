import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  outputFileTracingExcludes: { "/*": ["./.local-data/**/*", "./.local-evidence/**/*", "./inputs/**/*", "./华为PC全板块深度知识库_v7/**/*", "./设计参考/**/*", "./vendor/**/*"] },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};
export default config;
