import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app so Next/Turbopack doesn't try to infer
  // it from stray lockfiles further up the tree.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
