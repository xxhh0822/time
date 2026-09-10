import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'public', 'ocr')
const coreOutput = resolve(output, 'core')
const langOutput = resolve(output, 'lang')

await rm(output, { recursive: true, force: true })
await mkdir(coreOutput, { recursive: true })
await mkdir(langOutput, { recursive: true })

await cp(resolve(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'), resolve(output, 'worker.min.js'))

for (const file of [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) {
  await cp(resolve(root, 'node_modules', 'tesseract.js-core', file), resolve(coreOutput, file))
}

await cp(
  resolve(root, 'node_modules', '@tesseract.js-data', 'chi_sim', '4.0.0_best_int', 'chi_sim.traineddata.gz'),
  resolve(langOutput, 'chi_sim.traineddata.gz'),
)
await cp(
  resolve(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'),
  resolve(langOutput, 'eng.traineddata.gz'),
)

console.log('Prepared self-hosted OCR assets in public/ocr')
