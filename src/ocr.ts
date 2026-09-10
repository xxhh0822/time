import type { HelperType, WorkdayState } from './calculator'

export interface RecognizedField<T> {
  value: T | null
  confidence: number
  rawText: string
}

export interface RecognizedProject {
  id: string
  name: string
  remainingMinutes: number | null
  confidence: number
  recommended: boolean
  rawText: string
}

export interface ScreenshotRecognition {
  helperType: RecognizedField<HelperType>
  nominalLevel: RecognizedField<number>
  effectiveLevel: RecognizedField<number>
  state: RecognizedField<WorkdayState>
  projects: RecognizedProject[]
  cooldownMinutes: RecognizedField<number>
  activeRemainingMinutes: RecognizedField<number>
  warnings: string[]
}

export interface OcrRegionTexts {
  header: string
  projects: string
  status: string
  confidence?: number
}

export interface RecognitionProgress {
  progress: number
  label: string
}

const EMPTY_CONFIDENCE = 0

function normalizeOcrText(text: string) {
  return text
    .replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/(\d)[ \t]+(?=[天时分秒级])/g, '$1')
    .replace(/([A-Za-z]+)[ \t]+(?=级)/g, '$1')
    .replace(/([天时分秒级])[ \t]+(?=\d)/g, '$1')
    .replace(/吕(?=级)/g, '8')
    .replace(/\bTe(?=级实验助手)/gi, '12')
    .replace(/\bff(?=级)/gi, '11')
    .replace(/炸弹[培堵]/g, '炸弹塔')
}

function field<T>(value: T | null, rawText: string, confidence = EMPTY_CONFIDENCE): RecognizedField<T> {
  return { value, rawText: rawText.trim(), confidence: value === null ? 0 : Math.round(confidence) }
}

export function parseChineseDuration(text: string): number | null {
  const normalized = text
    .replace(/[日曰]/g, '天')
    .replace(/小[时對]/g, '小时')
    .replace(/分[钟鍾]/g, '分钟')
    .replace(/[：:]/g, ' ')
  const day = Number(normalized.match(/(\d+)\s*天/)?.[1] ?? 0)
  const hour = Number(normalized.match(/(\d+)\s*(?:小时|时)/)?.[1] ?? 0)
  const minute = Number(normalized.match(/(\d+)\s*(?:分钟|分)(?!钟)/)?.[1] ?? 0)
  const second = Number(normalized.match(/(\d+)\s*秒/)?.[1] ?? 0)
  if (!day && !hour && !minute && !second) return null
  return Math.ceil((day * 86_400 + hour * 3_600 + minute * 60 + second) / 60)
}

function cleanProjectName(value: string) {
  return value
    .replace(/^(?:进行中的(?:项目|升级)|指派(?:建筑工人学徒|实验助手))[?？:]*/g, '')
    .replace(/(?:节省时间|工作时间|工作速度|剩余时间|需等待).*$/g, '')
    .replace(/^[^\u4e00-\u9fff]+|[^\u4e00-\u9fff·\w]+$/g, '')
    .trim()
}

function parseStatusDuration(text: string, state: WorkdayState | null) {
  const parsed = parseChineseDuration(text)
  const numericLine = text.split(/\r?\n/).find((line) => (line.match(/\d+/g)?.length ?? 0) >= 2) ?? text
  const tokens = numericLine.match(/\d+/g) ?? []
  if (state === 'working' && tokens.length) {
    if (parsed !== null && parsed <= 60) return parsed
    const first = tokens[0] ?? ''
    let minute = Number(first)
    if (first.length === 3 && first.endsWith('5')) minute = Number(first.slice(0, 2))
    const second = Number(tokens[1] ?? 0)
    if (minute >= 0 && minute <= 60 && second >= 0 && second <= 59) return minute + (second > 0 ? 1 : 0)
  }
  if (state === 'used' && tokens.length >= 2) {
    const hour = Number(tokens[0])
    const minute = Number(tokens[tokens.length - 1])
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute
  }
  if (parsed !== null && (state !== 'used' || parsed <= 23 * 60)) return parsed
  return null
}

function extractProjects(text: string, confidence: number, state: WorkdayState | null) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const projects: RecognizedProject[] = []
  let pendingName = ''

  for (const line of lines) {
    if (/节省时间|工作时间|工作速度|最高等级|剩余时间|需等待|空闲中|当前段位|进行中的|指派|建筑.*学/.test(line)) continue
    const duration = parseChineseDuration(line)
    const firstDigit = line.search(/\d/)
    const inlineName = cleanProjectName(firstDigit >= 0 ? line.slice(0, firstDigit) : line)

    if (duration !== null && /天|小时|\d\s*时/.test(line)) {
      const name = inlineName || pendingName
      if (name) {
        const pending = [...projects].reverse().find((project) => project.name === name && project.remainingMinutes === null)
        if (pending) {
          pending.remainingMinutes = duration
          pending.rawText = `${pending.rawText}\n${line}`
        } else if (!projects.some((project) => project.name === name && project.remainingMinutes === duration)) {
          projects.push({
            id: `project-${projects.length + 1}`,
            name,
            remainingMinutes: duration,
            confidence: Math.round(confidence),
            recommended: state === 'working' && projects.length === 0,
            rawText: line,
          })
        }
      }
      pendingName = ''
    } else if (inlineName && inlineName.length <= 10 && (inlineName.match(/[\u4e00-\u9fff]/g)?.length ?? 0) >= 2) {
      pendingName = inlineName
      projects.push({
        id: `project-${projects.length + 1}`,
        name: inlineName,
        remainingMinutes: null,
        confidence: Math.round(confidence),
        recommended: state === 'working' && projects.length === 0,
        rawText: line,
      })
    }
  }

  return projects
}

export function parseRecognitionTexts(texts: OcrRegionTexts): ScreenshotRecognition {
  texts = {
    ...texts,
    header: normalizeOcrText(texts.header),
    projects: normalizeOcrText(texts.projects),
    status: normalizeOcrText(texts.status),
  }
  const confidence = texts.confidence ?? 70
  const allText = `${texts.header}\n${texts.projects}\n${texts.status}`
  const helperType = /建筑工人学徒/.test(allText)
    ? 'builder'
    : /实验助手/.test(allText)
      ? 'lab'
      : null
  const nominalMatch = texts.header.match(/(\d+)\s*级\s*(?:建筑工人学徒|实验助手)/)
  const effectiveMatch = texts.header.match(/当前效果\s*[:：-]?\s*(\d+)\s*级/)
  const levelCandidates = texts.header.match(/OCR_LEVELS:\s*([\d ]+)/)?.[1]
    ?.trim().split(/\s+/).map(Number).filter((level) => level > 0 && level <= 12) ?? []
  const state = /空[闲采]中/.test(texts.status)
    ? 'idle'
    : /需等待/.test(texts.status)
      ? 'used'
      : /剩余时间/.test(texts.status)
        ? 'working'
        : null
  const nominalLevel = nominalMatch ? Number(nominalMatch[1]) : levelCandidates[0] ?? null
  const effectiveLevel = effectiveMatch
    ? Number(effectiveMatch[1])
    : /当前效果/.test(texts.header)
      ? levelCandidates[1] ?? null
      : nominalLevel
  const statusMinutes = parseStatusDuration(texts.status, state)
  const projects = extractProjects(texts.projects, confidence, state)
  if (projects.length === 1) projects[0].recommended = true

  const warnings: string[] = []
  if (!helperType) warnings.push('未识别到帮手类型')
  if (!nominalLevel) warnings.push('未识别到帮手等级')
  if (!state) warnings.push('未识别到当前工作状态')
  if (!projects.length) warnings.push('未可靠识别到升级项目，请手动补充')
  else if (projects.some((project) => project.remainingMinutes === null)) warnings.push('部分项目时间未识别，请对照截图填写')
  if (state === 'used' && !statusMinutes) warnings.push('未识别到共享倒计时')
  if (state === 'working' && !statusMinutes) warnings.push('未识别到本轮剩余工作时间')
  if (confidence < 45) warnings.push('整体识别可信度较低，请逐项核对')

  return {
    helperType: field(helperType, texts.header, confidence),
    nominalLevel: field(nominalLevel, texts.header, confidence),
    effectiveLevel: field(effectiveLevel, texts.header, confidence),
    state: field(state, texts.status, confidence),
    projects,
    cooldownMinutes: field(state === 'used' ? statusMinutes : null, texts.status, confidence),
    activeRemainingMinutes: field(state === 'working' ? statusMinutes : null, texts.status, confidence),
    warnings,
  }
}

let activeWorker: import('tesseract.js').Worker | null = null
let recognitionGeneration = 0

function createProcessedRegion(
  source: CanvasImageSource & { width: number; height: number },
  region: { x: number; y: number; width: number; height: number },
  binary: boolean,
) {
  const sourceWidth = Math.round(source.width * region.width)
  const sourceHeight = Math.round(source.height * region.height)
  const scale = Math.max(1.5, Math.min(3, 1400 / sourceWidth))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sourceWidth * scale)
  canvas.height = Math.round(sourceHeight * scale)
  const context = canvas.getContext('2d', { willReadFrequently: binary })
  if (!context) throw new Error('当前浏览器无法处理图片。')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    source,
    Math.round(source.width * region.x),
    Math.round(source.height * region.y),
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  if (binary) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 0; index < image.data.length; index += 4) {
      const luminance = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114
      const value = luminance >= 128 ? 0 : 255
      image.data[index] = value
      image.data[index + 1] = value
      image.data[index + 2] = value
    }
    context.putImageData(image, 0, 0)
  }
  return canvas
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource & { width: number; height: number }
  close: () => void
}> {
  try {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, close: () => bitmap.close() }
  } catch {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    try {
      await image.decode()
      return { source: image, close: () => URL.revokeObjectURL(url) }
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('无法解码图片，请尝试重新截图或转换为PNG。')
    }
  }
}

async function createOcrWorker(onProgress: (progress: RecognitionProgress) => void) {
  if (activeWorker) return activeWorker
  const { createWorker, PSM } = await import('tesseract.js')
  const assetRoot = new URL('./ocr/', document.baseURI)
  activeWorker = await createWorker(['chi_sim', 'eng'], 1, {
    workerPath: new URL('worker.min.js', assetRoot).href,
    corePath: new URL('core/', assetRoot).href,
    langPath: new URL('lang', assetRoot).href,
    logger(message) {
      if (message.status === 'recognizing text') {
        onProgress({ progress: message.progress, label: '正在读取游戏文字' })
      }
    },
  })
  await activeWorker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
  return activeWorker
}

export async function cancelRecognition() {
  recognitionGeneration += 1
  const worker = activeWorker
  activeWorker = null
  if (worker) await worker.terminate()
}

export async function recognizeHelperScreenshot(
  file: File,
  onProgress: (progress: RecognitionProgress) => void = () => undefined,
) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('请选择 PNG、JPEG 或 WebP 图片。')
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('图片不能超过20 MB。')

  const generation = ++recognitionGeneration
  onProgress({ progress: 0.02, label: '正在读取图片' })
  const decoded = await decodeImage(file)
  const image = decoded.source
  try {
    if (image.width < 480 || image.height < 270 || image.width / image.height < 1.55) {
      throw new Error('请上传完整的横屏帮手详情页截图。')
    }
    const worker = await createOcrWorker(onProgress)
    const regions = {
      header: { x: 0.35, y: 0.025, width: 0.30, height: 0.10 },
      projects: { x: 0.48, y: 0.27, width: 0.34, height: 0.51 },
      status: { x: 0.72, y: 0.76, width: 0.11, height: 0.16 },
    }
    const output: OcrRegionTexts = { header: '', projects: '', status: '', confidence: 0 }
    const entries = Object.entries(regions) as [keyof typeof regions, (typeof regions)[keyof typeof regions]][]
    let confidenceTotal = 0

    for (let index = 0; index < entries.length; index += 1) {
      if (generation !== recognitionGeneration) throw new Error('识别已取消。')
      const [name, region] = entries[index]
      onProgress({ progress: 0.12 + index * 0.27, label: `正在识别${name === 'header' ? '帮手信息' : name === 'projects' ? '升级项目' : '工作状态'}` })
      const canvas = createProcessedRegion(image, region, true)
      const result = await worker.recognize(canvas)
      output[name] = result.data.text
      confidenceTotal += result.data.confidence
    }

    const { PSM } = await import('tesseract.js')
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '0123456789 ' })
    const levelCanvas = createProcessedRegion(image, regions.header, true)
    const levelResult = await worker.recognize(levelCanvas)
    const levelDigits = levelResult.data.text.match(/\d+/g)?.join(' ') ?? ''
    output.header += `\nOCR_LEVELS: ${levelDigits}`
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: '' })

    output.confidence = confidenceTotal / entries.length
    let parsed = parseRecognitionTexts(output)
    if (parsed.warnings.length || !parsed.projects.length) {
      onProgress({ progress: 0.88, label: '正在使用增强模式复核' })
      const fullPanel = createProcessedRegion(image, { x: 0.47, y: 0.02, width: 0.36, height: 0.91 }, false)
      const retry = await worker.recognize(fullPanel)
      parsed = parseRecognitionTexts({
        header: `${output.header}\n${retry.data.text}`,
        projects: output.projects,
        status: `${output.status}\n${retry.data.text}`,
        confidence: (output.confidence + retry.data.confidence) / 2,
      })
    }
    if (!parsed.projects.length) {
      const rowTexts: string[] = []
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
      for (let index = 0; index < 5; index += 1) {
        const row = createProcessedRegion(image, {
          x: 0.485,
          y: 0.345 + index * 0.09,
          width: 0.33,
          height: 0.075,
        }, true)
        const rowResult = await worker.recognize(row)
        rowTexts.push(rowResult.data.text)
      }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
      parsed = parseRecognitionTexts({
        header: output.header,
        projects: `${output.projects}\n${rowTexts.join('\n')}`,
        status: output.status,
        confidence: output.confidence,
      })
    }
    onProgress({ progress: 1, label: '识别完成，请核对结果' })
    return parsed
  } finally {
    decoded.close()
  }
}
