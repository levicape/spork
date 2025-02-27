import build from "@hono/vite-build/node";
import adapter from '@hono/vite-dev-server/node';
import ssg from '@hono/vite-ssg';
import tailwindcss from "@tailwindcss/vite";
import honox from 'honox/vite';
import client from 'honox/vite/client';
import { defineConfig } from 'vite';
import { env } from "std-env"

const entry = '/app/server.ts';
const { PORT } = env;

/**
 * @see https://vite.dev/config/
 */
export default defineConfig(({mode}) => {
  if (mode === 'client') {
    return {
      build: {
        outDir: 'output',
      },
      plugins: [client()],
    }
  };
    
  return {
    build: {
      emptyOutDir: false,
      outDir: 'output',
    },
    plugins: [
      honox({
        client: {
          input: ['/app/style.css'],
        },
        devServer: {
          adapter,
        },
      }),
      build({
        entry,
        port: PORT ? Number(PORT) : undefined,
      }),
      tailwindcss(),
      ssg({
        entry
      })
    ],
  };
});
