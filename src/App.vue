<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import builderApprenticeImage from './assets/builder-apprentice.png'
import labAssistantImage from './assets/lab-assistant.png'
import ScreenshotRecognizer, { type AppliedRecognition } from './ScreenshotRecognizer.vue'
import {
  calculateFinish,
  maxLevelFor,
  type BoostRecord,
  type CalculationResult,
  type HelperType,
  type WorkdayState,
} from './calculator'

const helperType = ref<HelperType>('lab')
const days = ref(0)
const hours = ref(0)
const minutes = ref(0)
const helperLevel = ref(8)
const workdayState = ref<WorkdayState>('idle')
const cooldownHours = ref(0)
const cooldownMinutes = ref(0)
const activeRemainingMinutes = ref(0)
const recognizedProjectName = ref('')
const result = ref<CalculationResult | null>(null)
const calculatedAt = ref<Date | null>(null)
const error = ref('')
const scheduleExpanded = ref(false)

const MAX_REMAINING_DAYS = 365
const MAX_REMAINING_MINUTES = MAX_REMAINING_DAYS * 24 * 60

const helper = computed(() => {
  if (helperType.value === 'lab') {
    return {
      name: '实验助手',
      project: '实验室研究',
      maxLevel: maxLevelFor('lab'),
      description: '为兵种、法术和攻城机器研究加速',
    }
  }

  return {
    name: '建筑工人学徒',
    project: '建筑工人项目',
    maxLevel: maxLevelFor('builder'),
    description: '为建筑、陷阱和英雄等施工项目加速',
  }
})

const levelOptions = computed(() =>
  Array.from({ length: helper.value.maxLevel }, (_, index) => index + 1),
)

const showCooldown = computed(() => workdayState.value === 'available' || workdayState.value === 'used')
const showActiveRemaining = computed(() => workdayState.value === 'working')

type VisibleBoost =
  | { kind: 'boost'; key: string; boost: BoostRecord; index: number }
  | { kind: 'omitted'; key: string; count: number }

const hasCollapsibleBoosts = computed(() => (result.value?.boosts.length ?? 0) > 11)

const visibleBoosts = computed<VisibleBoost[]>(() => {
  const boosts = result.value?.boosts ?? []
  const records = boosts.map((boost, index) => ({
    kind: 'boost' as const,
    key: `boost-${index}`,
    boost,
    index,
  }))

  if (scheduleExpanded.value || boosts.length <= 11) return records

  return [
    ...records.slice(0, 10),
    { kind: 'omitted', key: 'omitted', count: boosts.length - 11 },
    records[records.length - 1],
  ]
})

watch(
  [helperType, days, hours, minutes, helperLevel, workdayState, cooldownHours, cooldownMinutes, activeRemainingMinutes],
  () => {
    result.value = null
    calculatedAt.value = null
    error.value = ''
    scheduleExpanded.value = false
  },
  { flush: 'sync' },
)

function chooseHelper(type: HelperType) {
  helperType.value = type
  helperLevel.value = Math.min(helperLevel.value, maxLevelFor(type))
}

type TimeField = 'days' | 'hours' | 'minutes' | 'cooldownHours' | 'cooldownMinutes' | 'activeRemainingMinutes'

function defaultEmptyToZero(field: TimeField) {
  const fields = { days, hours, minutes, cooldownHours, cooldownMinutes, activeRemainingMinutes }
  const value = fields[field].value as number | string | null
  if (value === '' || value === null) fields[field].value = 0
}

function runCalculation() {
  const timeFields: TimeField[] = ['days', 'hours', 'minutes', 'cooldownHours', 'cooldownMinutes', 'activeRemainingMinutes']
  timeFields.forEach(defaultEmptyToZero)
  error.value = ''
  const values = [
    days.value,
    hours.value,
    minutes.value,
    ...(showCooldown.value ? [cooldownHours.value, cooldownMinutes.value] : []),
    ...(showActiveRemaining.value ? [activeRemainingMinutes.value] : []),
  ]

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    error.value = '请输入有效的非负时间。'
    return
  }

  if (values.some((value) => !Number.isInteger(value))) {
    error.value = '时间只能填写整数。'
    return
  }

  if (hours.value > 23 || minutes.value > 59) {
    error.value = '剩余时间中的小时应为0–23，分钟应为0–59。'
    return
  }

  const remaining = days.value * 24 * 60 + hours.value * 60 + minutes.value
  if (remaining <= 0) {
    error.value = '项目剩余时间必须大于0。'
    return
  }

  if (remaining > MAX_REMAINING_MINUTES) {
    error.value = `项目剩余时间不能超过${MAX_REMAINING_DAYS}天。`
    return
  }

  const cooldown = cooldownHours.value * 60 + cooldownMinutes.value
  if (showCooldown.value && (cooldown <= 0 || cooldown > 23 * 60)) {
    error.value = '共享倒计时应大于0且不超过23小时。'
    return
  }

  if (showActiveRemaining.value && (activeRemainingMinutes.value <= 0 || activeRemainingMinutes.value > 60)) {
    error.value = '本轮剩余工作时间应大于0且不超过60分钟。'
    return
  }

  const now = new Date()
  calculatedAt.value = now
  scheduleExpanded.value = false
  result.value = calculateFinish({
    startAt: now,
    remainingMinutes: remaining,
    helperLevel: helperLevel.value,
    workdayState: workdayState.value,
    cooldownMinutes: showCooldown.value ? cooldown : 0,
    activeRemainingMinutes: showActiveRemaining.value ? activeRemainingMinutes.value : 0,
  })
}

function applyRecognition(value: AppliedRecognition) {
  helperType.value = value.helperType
  helperLevel.value = value.helperLevel
  workdayState.value = value.workdayState
  days.value = Math.floor(value.remainingMinutes / 1440)
  hours.value = Math.floor((value.remainingMinutes % 1440) / 60)
  minutes.value = value.remainingMinutes % 60
  cooldownHours.value = Math.floor(value.cooldownMinutes / 60)
  cooldownMinutes.value = value.cooldownMinutes % 60
  activeRemainingMinutes.value = value.activeRemainingMinutes
  recognizedProjectName.value = value.projectName
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDuration(value: number) {
  const total = Math.max(0, Math.ceil(value))
  const day = Math.floor(total / 1440)
  const hour = Math.floor((total % 1440) / 60)
  const minute = total % 60
  return [day ? `${day}天` : '', hour ? `${hour}小时` : '', minute || (!day && !hour) ? `${minute}分钟` : '']
    .filter(Boolean)
    .join('')
}

function stateDescription() {
  if (workdayState.value === 'idle') return '立即工作，随后开启23小时共享工作日'
  if (workdayState.value === 'available') return '本轮立即工作，下次按共享倒计时刷新'
  if (workdayState.value === 'working') return '先完成当前工作时段，再按共享工作日持续指派'
  return '本轮已使用，等待共享倒计时结束后工作'
}
</script>

<template>
  <div class="page-shell">
    <header class="hero">
      <div class="brand-mark" aria-hidden="true">⏱</div>
      <div>
        <p class="eyebrow">CLASH HELPER CALCULATOR</p>
        <h1>部落冲突帮手时间计算器</h1>
        <p class="hero-copy">算清每一次加速，提前知道升级在哪一刻完成。</p>
      </div>
    </header>

    <main class="calculator-layout">
      <section class="panel input-panel" aria-labelledby="input-title">
        <div class="panel-heading">
          <div>
            <span class="step-number">01</span>
            <h2 id="input-title">设置升级项目</h2>
          </div>
          <span class="auto-tag">持续指派</span>
        </div>

        <ScreenshotRecognizer @apply="applyRecognition" />

        <div class="helper-picker" role="radiogroup" aria-label="选择帮手类型">
          <button
            type="button"
            class="helper-option"
            :class="{ selected: helperType === 'lab' }"
            :aria-pressed="helperType === 'lab'"
            @click="chooseHelper('lab')"
          >
            <span class="portrait-wrap lab-portrait">
              <img src="./assets/lab-assistant.png" alt="实验助手" />
            </span>
            <span>
              <strong>实验助手</strong>
              <small>实验室研究</small>
            </span>
            <span class="select-dot" aria-hidden="true"></span>
          </button>
          <button
            type="button"
            class="helper-option"
            :class="{ selected: helperType === 'builder' }"
            :aria-pressed="helperType === 'builder'"
            @click="chooseHelper('builder')"
          >
            <span class="portrait-wrap builder-portrait">
              <img src="./assets/builder-apprentice.png" alt="建筑工人学徒" />
            </span>
            <span>
              <strong>建筑工人学徒</strong>
              <small>建筑工人项目</small>
            </span>
            <span class="select-dot" aria-hidden="true"></span>
          </button>
        </div>

        <div class="field-group">
          <div class="field-title">
            <label>当前剩余时间</label>
            <span>{{ recognizedProjectName || '按游戏界面填写' }}</span>
          </div>
          <div class="duration-fields">
            <label><input v-model.number="days" type="number" inputmode="numeric" min="0" :max="MAX_REMAINING_DAYS" step="1" @blur="defaultEmptyToZero('days')" /><span>天</span></label>
            <label><input v-model.number="hours" type="number" inputmode="numeric" min="0" max="23" step="1" @blur="defaultEmptyToZero('hours')" /><span>时</span></label>
            <label><input v-model.number="minutes" type="number" inputmode="numeric" min="0" max="59" step="1" @blur="defaultEmptyToZero('minutes')" /><span>分</span></label>
          </div>
        </div>

        <div class="field-group two-columns">
          <label class="select-field">
            <span>帮手等级</span>
            <select v-model.number="helperLevel">
              <option v-for="level in levelOptions" :key="level" :value="level">
                {{ level }}级 · 加速{{ level }}小时
              </option>
            </select>
          </label>
          <div class="level-note">
            <strong>{{ helper.name }}</strong>
            <span>{{ helper.description }}</span>
          </div>
        </div>

        <div class="field-group">
          <label class="select-field">
            <span>当前帮手状态</span>
            <select v-model="workdayState">
              <option value="idle">全部已刷新，现在可用</option>
              <option value="available">共享倒计时中，本轮尚未使用</option>
              <option value="working">正在工作</option>
              <option value="used">本轮已经使用</option>
            </select>
          </label>
          <p class="field-hint">{{ stateDescription() }}</p>
        </div>

        <div v-if="showActiveRemaining" class="field-group cooldown-group active-work-group">
          <div class="field-title">
            <label>本轮剩余工作时间</label>
            <span>最长60分钟</span>
          </div>
          <div class="duration-fields one-time-field">
            <label><input v-model.number="activeRemainingMinutes" type="number" inputmode="numeric" min="1" max="60" step="1" @blur="defaultEmptyToZero('activeRemainingMinutes')" /><span>分钟</span></label>
          </div>
          <p class="field-hint">截图包含秒数时按分钟向上取整</p>
        </div>

        <div v-if="showCooldown" class="field-group cooldown-group">
          <div class="field-title">
            <label>共享倒计时剩余</label>
            <span>最长23小时</span>
          </div>
          <div class="duration-fields two-time-fields">
            <label><input v-model.number="cooldownHours" type="number" inputmode="numeric" min="0" max="23" step="1" @blur="defaultEmptyToZero('cooldownHours')" /><span>小时</span></label>
            <label><input v-model.number="cooldownMinutes" type="number" inputmode="numeric" min="0" max="59" step="1" @blur="defaultEmptyToZero('cooldownMinutes')" /><span>分钟</span></label>
          </div>
        </div>

        <p v-if="error" class="error-message" role="alert">{{ error }}</p>

        <button type="button" class="calculate-button" @click="runCalculation">
          <span>计算预计完成时间</span>
          <span aria-hidden="true">→</span>
        </button>
      </section>

      <section class="panel result-panel" aria-labelledby="result-title" aria-live="polite">
        <div class="panel-heading result-heading">
          <div>
            <span class="step-number">02</span>
            <h2 id="result-title">计算结果</h2>
          </div>
          <span v-if="result" class="result-status">计算完成</span>
        </div>

        <div v-if="result" class="result-content">
          <div class="finish-card" :class="helperType">
            <div class="result-character" :class="helperType">
              <img :src="helperType === 'lab' ? labAssistantImage : builderApprenticeImage" :alt="helper.name" />
            </div>
            <div class="finish-main">
              <span>使用{{ helper.name }}后</span>
              <strong>{{ formatDateTime(result.boostedFinishAt) }}</strong>
              <small>预计升级完成</small>
            </div>
          </div>

          <div class="comparison-grid">
            <div>
              <span>原完成时间</span>
              <strong>{{ formatDateTime(result.baselineFinishAt) }}</strong>
            </div>
            <div class="saved-time">
              <span>预计节省</span>
              <strong>{{ formatDuration(result.savedMinutes) }}</strong>
            </div>
            <div>
              <span>预计加速</span>
              <strong>{{ result.boosts.length }}次</strong>
            </div>
          </div>

          <div class="schedule-section">
            <div class="schedule-title">
              <h3>预计加速记录</h3>
              <span v-if="calculatedAt">基于 {{ formatDateTime(calculatedAt) }}</span>
            </div>
            <template v-if="result.boosts.length">
              <ol class="boost-list">
                <template v-for="item in visibleBoosts" :key="item.key">
                  <li v-if="item.kind === 'boost'">
                    <span class="boost-index">{{ String(item.index + 1).padStart(2, '0') }}</span>
                    <span class="boost-line" aria-hidden="true"></span>
                    <div>
                      <strong>{{ formatDateTime(item.boost.startsAt) }}</strong>
                      <span>
                        {{ item.boost.partial ? '部分加速' : '完整加速' }} ·
                        加速{{ formatDuration(item.boost.helperProgressMinutes) }}
                      </span>
                    </div>
                  </li>
                  <li v-else class="boost-omitted">中间 {{ item.count }} 次记录已折叠</li>
                </template>
              </ol>
              <button
                v-if="hasCollapsibleBoosts"
                type="button"
                class="schedule-toggle"
                :aria-expanded="scheduleExpanded"
                @click="scheduleExpanded = !scheduleExpanded"
              >
                {{ scheduleExpanded ? '收起记录' : `展开全部 ${result.boosts.length} 次` }}
              </button>
            </template>
            <div v-else class="no-boost">
              项目会在帮手恢复前完成，本次不会触发加速。
            </div>
          </div>
        </div>

        <div v-else class="empty-result">
          <div class="empty-orbit" aria-hidden="true">
            <span></span>
            <b>⌛</b>
          </div>
          <h3>等待计算</h3>
          <p>填写左侧升级信息，即可查看准确的完成时间和每轮加速记录。</p>
        </div>
      </section>
    </main>

    <footer>
      <span>计算规则：帮手每次工作1小时，所有帮手共用23小时工作日。</span>
      <span>时间结果以当前设备时区为准</span>
      <span>
        本工具为非官方玩家内容，未经 Supercell 认可。详见
        <a href="https://supercell.com/en/fan-content-policy/" target="_blank" rel="noreferrer">粉丝内容政策</a>。
      </span>
    </footer>
  </div>
</template>
