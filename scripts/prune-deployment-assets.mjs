import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const buildRoot = resolve(process.cwd(), 'dist')

for (const relativePath of [
  'assets/_source-backup',
  'assets/weather/rain-cloud.png',
  'assets/README.md',
]) {
  rmSync(resolve(buildRoot, relativePath), { recursive: true, force: true })
}

console.log('Removed source backups and unused legacy artwork from dist.')
