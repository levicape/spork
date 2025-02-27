import build from "@hono/vite-build/node";
import adapter from '@hono/vite-dev-server/node';
import ssg from '@hono/vite-ssg';
import tailwindcss from "@tailwindcss/vite";
import honox from 'honox/vite';
import client from 'honox/vite/client';
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
      plugins: [client()],
    }
  };
    
  return {
    build: {
      emptyOutDir: false,
    },
    plugins: [
      tailwindcss(),
      honox({
        client: {
          input: [
            './app/*.css',
            './app/**/*.css'
          ],
        },
        devServer: {
          adapter,
        },
      }),
      build({
        entry,
        port: PORT ? Number(PORT) : undefined,
      }),
      ssg({
        entry
      })
    ],
  };
});
