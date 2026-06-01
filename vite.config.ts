import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

type ApiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/**
 * dev 用に /api/* を Vercel Function ハンドラとして動かす軽量プラグイン。
 * 本番では同じ api/*.ts を Vercel が直接実行するので、ここはローカル検証専用。
 * ハンドラは ssrLoadModule で都度ロードするため HMR が効き、型結合も生まない。
 */
function apiDevServer(): PluginOption {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/chat.ts')
          await (mod.default as ApiHandler)(req, res)
        } catch (err) {
          server.config.logger.error(`[api/chat] ${(err as Error).stack ?? String(err)}`)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
          }
          res.end(JSON.stringify({ error: 'dev API でエラーが発生しました' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 非 VITE_ の値（GEMINI_API_KEY 等）は通常クライアントに出ないため、
  // サーバ側ハンドラ用に process.env へ流し込む。
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['GEMINI_API_KEY', 'GEMINI_TEXT_MODEL', 'ANTHROPIC_API_KEY'] as const) {
    if (env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [react(), apiDevServer()],
    server: {
      port: 5175,
      strictPort: true,
    },
  }
})
