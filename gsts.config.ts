import type { GstsConfig } from 'genshin-ts'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  lang: 'zh-CN',
  inject: {
    mapId: 1073741835
  }
}

export default config
