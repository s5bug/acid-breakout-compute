import { defineConfig, loadEnv } from 'vite'
import glsl from 'vite-plugin-glsl'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  let basePath: string
  if (env.GITHUB_ACTIONS === 'true') {
    basePath = `/${env.GITHUB_REPOSITORY.split('/')[1]}`
  } else {
    basePath = '/'
  }
  return {
    base: basePath,
    plugins: [
      glsl({
        include: ['**/*.glsl', '**/*.vert', '**/*.frag'],
        watch: true,
      }),
    ],
  }
})
