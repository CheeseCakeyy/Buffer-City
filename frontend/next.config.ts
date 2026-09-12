import type { NextConfig } from 'next';

const config: NextConfig = {
  // This repository contains two independent applications.
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
};

export default config;
