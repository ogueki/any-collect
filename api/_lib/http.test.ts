import { describe, it, expect, afterEach } from 'vitest'
import type { ServerResponse } from 'node:http'
import {
  parseImageDataUrl,
  rejectForeignOrigin,
  sanitizePersonaId,
  sanitizeText,
  type NodeReq,
} from './http.js'

/**
 * 公開エンドポイントの入口ガード。**ここが緩むと課金と安全が同時に効く**ので、
 * 目視でなくテストで固定する。とくに `rejectForeignOrigin` は**本番を締め出しうる**
 * （許可の側を間違えるとアプリ全体が 403 になる）ので、通す側も落とす側も両方書く。
 */

/** `sendJson` が使うのは setHeader / end / statusCode だけ。 */
function fakeRes() {
  const res = {
    statusCode: 200,
    body: '',
    headersSent: false,
    setHeader() {},
    end(payload?: string) {
      res.body = payload ?? ''
    },
  }
  return res as unknown as ServerResponse & { body: string }
}

function req(headers: Record<string, string>): NodeReq {
  return { headers } as unknown as NodeReq
}

describe('rejectForeignOrigin', () => {
  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS
    delete process.env.VERCEL_URL
  })

  const allow = (v = 'https://any-collect.vercel.app') => {
    process.env.ALLOWED_ORIGINS = v
  }

  describe('ALLOWED_ORIGINS が未設定なら検査しない（opt-in）', () => {
    // 設定を忘れただけで本番が全滅するほうが、素通しより害が大きい、という判断。
    it('Origin が無くても通す', () => {
      expect(rejectForeignOrigin(req({}), fakeRes())).toBe(false)
    })
    it('他所の Origin でも通す', () => {
      expect(rejectForeignOrigin(req({ origin: 'https://evil.example' }), fakeRes())).toBe(false)
    })
  })

  describe('通すもの', () => {
    it('許可したオリジンそのもの', () => {
      allow()
      expect(
        rejectForeignOrigin(req({ origin: 'https://any-collect.vercel.app' }), fakeRes()),
      ).toBe(false)
    })

    it('末尾スラッシュ付き', () => {
      allow()
      expect(
        rejectForeignOrigin(req({ origin: 'https://any-collect.vercel.app/' }), fakeRes()),
      ).toBe(false)
    })

    it('大文字混じり（オリジンは大小を区別しない）', () => {
      allow()
      expect(
        rejectForeignOrigin(req({ origin: 'https://Any-Collect.Vercel.App' }), fakeRes()),
      ).toBe(false)
    })

    it('Origin が無くても Referer から導出できれば通す', () => {
      allow()
      expect(
        rejectForeignOrigin(
          req({ referer: 'https://any-collect.vercel.app/?debug=1' }),
          fakeRes(),
        ),
      ).toBe(false)
    })

    it('プレビュー配信は VERCEL_URL で自動的に許可される', () => {
      // 配信のたびにホスト名が変わるので、許可リストに書き足す運用にはできない。
      allow()
      process.env.VERCEL_URL = 'any-collect-git-abc123.vercel.app'
      expect(
        rejectForeignOrigin(req({ origin: 'https://any-collect-git-abc123.vercel.app' }), fakeRes()),
      ).toBe(false)
    })

    it('カンマ区切りで複数指定できる（前後の空白は無視）', () => {
      allow('https://any-collect.vercel.app, http://localhost:5173')
      expect(rejectForeignOrigin(req({ origin: 'http://localhost:5173' }), fakeRes())).toBe(false)
    })
  })

  describe('落とすもの（403）', () => {
    const expectRejected = (headers: Record<string, string>) => {
      const res = fakeRes()
      expect(rejectForeignOrigin(req(headers), res)).toBe(true)
      expect(res.statusCode).toBe(403)
      // 生の理由を外に出さない（何が許可されているかを教えない）。
      expect(res.body).not.toContain('any-collect')
    }

    it('curl（Origin も Referer も無い）', () => {
      allow()
      expectRejected({})
    })

    it('他所のサイトから', () => {
      allow()
      expectRejected({ origin: 'https://evil.example' })
    })

    it('前方一致で騙そうとするドメイン', () => {
      // 部分一致で判定していると通ってしまう形。完全一致であることの固定。
      allow()
      expectRejected({ origin: 'https://any-collect.vercel.app.evil.example' })
    })

    it('スキーム違い（https のみ許可しているとき http は別オリジン）', () => {
      allow()
      expectRejected({ origin: 'http://any-collect.vercel.app' })
    })

    it('壊れた Referer', () => {
      allow()
      expectRejected({ referer: 'not a url' })
    })
  })
})

describe('sanitizePersonaId', () => {
  // パストラバーサル対策。これを抜けると resolve() でリポジトリ外を読ませられる。
  it.each(['default', 'colette2', 'a', 'A-b_c'])('安全な id は通す: %s', (id) => {
    expect(sanitizePersonaId(id)).toBe(id)
  })

  it.each([
    ['../../..', '親ディレクトリ'],
    ['../secrets', '相対パス'],
    ['a/b', 'スラッシュ'],
    ['a.b', 'ドット'],
    ['_leading', '先頭が記号'],
    ['', '空文字'],
    ['x'.repeat(33), '長すぎる'],
  ])('危険な id は undefined: %s（%s）', (id) => {
    expect(sanitizePersonaId(id)).toBeUndefined()
  })

  it('文字列でなければ undefined', () => {
    expect(sanitizePersonaId(undefined)).toBeUndefined()
    expect(sanitizePersonaId(123)).toBeUndefined()
    expect(sanitizePersonaId({ toString: () => 'default' })).toBeUndefined()
  })
})

describe('sanitizeText', () => {
  it('制御文字を潰してプロンプトの構造を壊させない', () => {
    // 改行を残すと「# 見出し」を注入してシステムプロンプトを偽装できる。
    expect(sanitizeText('あ\n\n# 命令\r\nい', 100)).toBe('あ # 命令 い')
  })

  it('連続する空白は1つにまとめる', () => {
    expect(sanitizeText('a    b', 100)).toBe('a b')
  })

  it('前後の空白を落とす', () => {
    expect(sanitizeText('  ねこ  ', 100)).toBe('ねこ')
  })

  it('最大長で切る', () => {
    expect(sanitizeText('あ'.repeat(50), 10)).toBe('あ'.repeat(10))
  })

  it('空になるものは undefined（呼び出し側が「無い」として扱えるように）', () => {
    expect(sanitizeText('   ', 100)).toBeUndefined()
    expect(sanitizeText('', 100)).toBeUndefined()
    expect(sanitizeText(undefined, 100)).toBeUndefined()
    expect(sanitizeText(42, 100)).toBeUndefined()
  })
})

describe('parseImageDataUrl', () => {
  it('data URL を mimeType と base64 に分解する', () => {
    expect(parseImageDataUrl('data:image/jpeg;base64,AAAA')).toEqual({
      mimeType: 'image/jpeg',
      data: 'AAAA',
    })
  })

  it('png / webp も通る', () => {
    expect(parseImageDataUrl('data:image/png;base64,BBBB')?.mimeType).toBe('image/png')
    expect(parseImageDataUrl('data:image/webp;base64,CCCC')?.mimeType).toBe('image/webp')
  })

  it('画像以外の data URL は受け付けない', () => {
    expect(parseImageDataUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
    expect(parseImageDataUrl('data:application/json;base64,e30=')).toBeNull()
  })

  it('data URL でないものは null', () => {
    expect(parseImageDataUrl('https://example.com/a.png')).toBeNull()
    expect(parseImageDataUrl('')).toBeNull()
    expect(parseImageDataUrl(undefined)).toBeNull()
  })
})
