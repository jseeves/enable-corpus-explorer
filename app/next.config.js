/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Plotly is large; recommend client-side dynamic import in CorpusExplorer
  webpack: (config) => {
    config.externals = config.externals || [];
    return config;
  },
};

module.exports = nextConfig;
