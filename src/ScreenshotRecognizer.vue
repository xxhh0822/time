<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { cancelRecognition, recognizeHelperScreenshot, type RecognitionProgress, type ScreenshotRecognition } from './ocr'
import type { HelperType, WorkdayState } from './calculator'

export interface AppliedRecognition {
  helperType: HelperType
  helperLevel: number
  workdayState: WorkdayState
  remainingMinutes: number
  cooldownMinutes: number
  activeRemainingMinutes: number
  projectName: string
}

interface EditableProject {
  id: string
  name: string
  days: number
  hours: number
  minutes: number
  confidence: number
}

const props = defineProps<{
  recognizer?: typeof recognizeHelperScreenshot
}>()
const emit = defineEmits<{ apply: [value: AppliedRecognition] }>()

const input = ref<HTMLInputElement | null>(null)
const previewUrl = ref('')
const fileName = ref('')
const dragging = ref(false)
const recognizing = ref(false)
const progress = ref<RecognitionProgress>({ progress: 0, label: '' })
const recognitionError = ref('')
const result = ref<ScreenshotRecognition | null>(null)
const helperType = ref<HelperType | ''>('')
const nominalLevel = ref<number | null>(null)
const effectiveLevel = ref<number | null>(null)
const state = ref<WorkdayState | ''>('')
const projects = ref<EditableProject[]>([])
const selectedProjectId = ref('')
const cooldownHours = ref(0)
const cooldownMinutes = ref(0)
const activeRemainingMinutes = ref(0)
const appliedMessage = ref('')

const maxLevel = computed(() => helperType.value === 'builder' ? 8 : 12)
const selectedProject = computed(() => projects.value.find((project) => project.id === selectedProjectId.value))
const canApply = computed(() => {
  const project = selectedProject.value
  const projectMinutes = project ? project.days * 1440 + project.hours * 60 + project.minutes : 0
  if (!helperType.value || !state.value || !nominalLevel.value || !effectiveLevel.value) return false
  if (nominalLevel.value > maxLevel.value || effectiveLevel.value > maxLevel.value) return false
  if (!project?.name.trim() || project.days < 0 || project.days > 365 || project.hours < 0 || project.hours > 23 || project.minutes < 0 || project.minutes > 59) return false
  if (projectMinutes <= 0 || projectMinutes > 365 * 1440) return false
  const cooldown = cooldownHours.value * 60 + cooldownMinutes.value
  if (state.value === 'used' && (cooldown <= 0 || cooldown > 23 * 60 || cooldownMinutes.value > 59)) return false
  if (state.value === 'working' && (activeRemainingMinutes.value <= 0 || activeRemainingMinutes.value > 60)) return false
  return true
})

function splitMinutes(total: number | null) {
  const value = Math.max(0, total ?? 0)
  return {
    days: Math.floor(value / 1440),
    hours: Math.floor((value % 1440) / 60),
    minutes: value % 60,
  }
}

function loadEditableResult(value: ScreenshotRecognition) {
  helperType.value = value.helperType.value ?? ''
  nominalLevel.value = value.nominalLevel.value
  effectiveLevel.value = value.effectiveLevel.value
  state.value = value.state.value ?? ''
  projects.value = value.projects.map((project) => ({
    id: project.id,
    name: project.name,
    ...splitMinutes(project.remainingMinutes),
    confidence: project.confidence,
  }))
  selectedProjectId.value = value.projects.find((project) => project.recommended)?.id ?? ''
  const cooldown = splitMinutes(value.cooldownMinutes.value)
  cooldownHours.value = cooldown.days * 24 + cooldown.hours
  cooldownMinutes.value = cooldown.minutes
  activeRemainingMinutes.value = value.activeRemainingMinutes.value ?? 0
  appliedMessage.value = ''
}

function releasePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

async function processFile(file?: File) {
  if (!file) return
  await cancelRecognition()
  releasePreview()
  previewUrl.value = URL.createObjectURL(file)
  fileName.value = file.name
  recognitionError.value = ''
  result.value = null
  appliedMessage.value = ''
  recognizing.value = true
  progress.value = { progress: 0, label: '准备识别' }

  try {
    const recognize = props.recognizer ?? recognizeHelperScreenshot
    const recognized = await recognize(file, (value) => { progress.value = value })
    result.value = recognized
    loadEditableResult(recognized)
  } catch (error) {
    recognitionError.value = error instanceof Error ? error.message : '图片识别失败，请重试或手动填写。'
  } finally {
    recognizing.value = false
  }
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  void processFile(target.files?.[0])
  target.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void processFile(event.dataTransfer?.files[0])
}

function onPaste(event: ClipboardEvent) {
  const image = [...(event.clipboardData?.items ?? [])].find((item) => item.type.startsWith('image/'))
  if (image) {
    event.preventDefault()
    void processFile(image.getAsFile() ?? undefined)
  }
}

function addProject() {
  const id = `manual-${Date.now()}`
  projects.value.push({ id, name: '', days: 0, hours: 0, minutes: 0, confidence: 100 })
  selectedProjectId.value = id
  appliedMessage.value = ''
}

function removeProject(id: string) {
  projects.value = projects.value.filter((project) => project.id !== id)
  if (selectedProjectId.value === id) selectedProjectId.value = ''
  appliedMessage.value = ''
}

async function reset() {
  await cancelRecognition()
  releasePreview()
  fileName.value = ''
  result.value = null
  recognitionError.value = ''
  recognizing.value = false
}

function applyResult() {
  const project = selectedProject.value
  if (!canApply.value || !project || !helperType.value || !state.value || !effectiveLevel.value) return
  emit('apply', {
    helperType: helperType.value,
    helperLevel: effectiveLevel.value,
    workdayState: state.value,
    remainingMinutes: project.days * 1440 + project.hours * 60 + project.minutes,
    cooldownMinutes: state.value === 'used' ? cooldownHours.value * 60 + cooldownMinutes.value : 0,
    activeRemainingMinutes: state.value === 'working' ? activeRemainingMinutes.value : 0,
    projectName: project.name,
  })
  appliedMessage.value = '已成功应用到下方计算器，请继续点击“计算预计完成时间”。'
}

onBeforeUnmount(() => {
  releasePreview()
  void cancelRecognition()
})

</script>

<template>
  <section class="screenshot-recognizer" aria-labelledby="screenshot-title" @paste="onPaste">
    <div class="screenshot-heading">
      <div>
        <span class="feature-badge">本地识别</span>
        <h3 id="screenshot-title">从游戏截图填写</h3>
      </div>
      <span>图片不会上传</span>
    </div>

    <input ref="input" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" @change="onFileChange" />
    <button
      v-if="!previewUrl"
      type="button"
      class="screenshot-dropzone"
      :class="{ dragging }"
      @click="input?.click()"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <span class="upload-icon" aria-hidden="true">⌁</span>
      <strong>选择、拖放或粘贴截图</strong>
      <small>支持完整横屏的中文帮手详情页 · PNG/JPEG/WebP · 最大20 MB</small>
    </button>

    <div v-else class="screenshot-preview">
      <img :src="previewUrl" alt="待识别的游戏截图预览" />
      <div>
        <strong>{{ fileName || '粘贴的截图' }}</strong>
        <span v-if="recognizing">{{ progress.label }} · {{ Math.round(progress.progress * 100) }}%</span>
        <span v-else-if="result">已识别，请逐项核对</span>
        <span v-else>识别未完成</span>
      </div>
      <button type="button" @click="input?.click()">更换</button>
      <button type="button" class="text-danger" @click="reset">取消</button>
    </div>
    <div v-if="recognizing" class="recognition-progress" role="progressbar" :aria-valuenow="Math.round(progress.progress * 100)" aria-valuemin="0" aria-valuemax="100">
      <span :style="{ width: `${progress.progress * 100}%` }"></span>
    </div>
    <p v-if="recognitionError" class="error-message" role="alert">{{ recognitionError }}</p>

    <div v-if="result" class="recognition-review">
      <div v-if="result.warnings.length" class="recognition-warnings">
        <strong>以下内容需要核对</strong>
        <span>{{ result.warnings.join('；') }}</span>
      </div>

      <div class="recognition-grid">
        <label class="select-field">
          <span>帮手类型</span>
          <select v-model="helperType" @change="appliedMessage = ''">
            <option value="" disabled>请选择</option>
            <option value="lab">实验助手</option>
            <option value="builder">建筑工人学徒</option>
          </select>
        </label>
        <label class="compact-field">
          <span>显示等级</span>
          <input v-model.number="nominalLevel" type="number" inputmode="numeric" min="1" :max="maxLevel" @input="appliedMessage = ''" />
        </label>
        <label class="compact-field">
          <span>实际生效等级</span>
          <input v-model.number="effectiveLevel" type="number" inputmode="numeric" min="1" :max="maxLevel" @input="appliedMessage = ''" />
        </label>
      </div>

      <label class="select-field recognition-state">
        <span>截图中的状态</span>
        <select v-model="state" @change="appliedMessage = ''">
          <option value="" disabled>请选择</option>
          <option value="idle">空闲中</option>
          <option value="working">正在工作</option>
          <option value="used">需等待下一工作日</option>
          <option value="available">本轮尚未使用</option>
        </select>
      </label>

      <div v-if="state === 'used'" class="recognition-timer">
        <span>共享倒计时</span>
        <label><input v-model.number="cooldownHours" type="number" inputmode="numeric" min="0" max="23" @input="appliedMessage = ''" /> 小时</label>
        <label><input v-model.number="cooldownMinutes" type="number" inputmode="numeric" min="0" max="59" @input="appliedMessage = ''" /> 分钟</label>
      </div>
      <div v-else-if="state === 'working'" class="recognition-timer">
        <span>本轮剩余工作</span>
        <label><input v-model.number="activeRemainingMinutes" type="number" inputmode="numeric" min="1" max="60" @input="appliedMessage = ''" /> 分钟</label>
        <small>截图中的秒数已向上取整</small>
      </div>

      <div class="recognized-projects">
        <div class="recognized-projects-heading">
          <strong>选择要计算的项目</strong>
          <button type="button" @click="addProject">＋ 手动添加</button>
        </div>
        <p v-if="!projects.length" class="empty-projects">没有可靠结果，请手动添加项目。</p>
        <div v-for="project in projects" :key="project.id" class="recognized-project" :class="{ selected: selectedProjectId === project.id }">
          <input v-model="selectedProjectId" type="radio" name="recognized-project" :value="project.id" :aria-label="`选择${project.name || '此项目'}`" @change="appliedMessage = ''" />
          <input v-model="project.name" class="project-name-input" aria-label="项目名称" placeholder="项目名称" @input="appliedMessage = ''" />
          <span class="project-time-inputs">
            <label><input v-model.number="project.days" aria-label="剩余天数" type="number" inputmode="numeric" min="0" max="365" @input="appliedMessage = ''" /><span>天</span></label>
            <label><input v-model.number="project.hours" aria-label="剩余小时" type="number" inputmode="numeric" min="0" max="23" @input="appliedMessage = ''" /><span>时</span></label>
            <label><input v-model.number="project.minutes" aria-label="剩余分钟" type="number" inputmode="numeric" min="0" max="59" @input="appliedMessage = ''" /><span>分</span></label>
          </span>
          <button type="button" class="remove-project" aria-label="删除项目" @click.prevent="removeProject(project.id)">×</button>
        </div>
      </div>

      <button type="button" class="apply-recognition" :disabled="!canApply" @click="applyResult">应用识别结果到计算器</button>
      <p v-if="appliedMessage" class="recognition-success" role="status">✓ {{ appliedMessage }}</p>
      <p v-else class="recognition-hint">应用后仍需点击“计算预计完成时间”，不会自动计算。</p>
    </div>
  </section>
</template>
