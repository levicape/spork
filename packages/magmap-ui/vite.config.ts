import build from "@hono/vite-build/node";
import adapter from '@hono/vite-dev-server/node';
import ssg from '@hono/vite-ssg';
import tailwindcss from "@tailwindcss/vite";
import honox from 'honox/vite';
import { env } from "std-env";
import { defineConfig } from 'vite';

const entry = '/app/server.ts';
const { PORT } = env;

/**
 * @see https://vite.dev/config/
 */
export default defineConfig(({mode}) => {
  if (mode === 'client') {
    return {
      build: {
        rollupOptions: {
          input: ['./app/client.ts', './app/style.css'],
          output: {
            entryFileNames: 'static/client.js',
            chunkFileNames: 'static/assets/[name]-[hash].js',
            assetFileNames: 'static/assets/[name].[ext]'
          }
        },
        emptyOutDir: false
      },
      plugins: [
        tailwindcss()
      ]
    }
  }

  return {
    build: {
      emptyOutDir: false,
    },
    ssr: {
      external: ['react', 'react-dom'],
      noExternal: true,
    },
    plugins: [
      tailwindcss(),
      honox({
        client: {
          input: [
            './app/style.css',
          ],
        },
        devServer: {
          adapter,
        },
      }),
      build({
        port: PORT ? Number(PORT) : undefined,
      }),
      ssg({
        entry
      })
    ],
  };
});
