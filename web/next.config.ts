import type { NextConfig } from "next";

// A static export: `next build` writes plain HTML, CSS and JS to out/. There is no server code in web/,
// so nothing here can hold a key or call a model. The browser talks to the FastAPI backend only.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
