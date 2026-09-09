<script setup lang="ts">
import { computed, ref } from 'vue'
import builderApprenticeImage from './assets/builder-apprentice.png'
import labAssistantImage from './assets/lab-assistant.png'
import {
  calculateFinish,
  maxLevelFor,
  type CalculationResult,
  type HelperType,
  type WorkdayState,
} from './calculator'

const helperType = ref<HelperType>('lab')
const days = ref(0)
const hours = ref(0)
const minutes = ref(0)
const helperLevel = ref(8)
const workdayState = ref<WorkdayState>('used')
const cooldownHours = ref(0)
const cooldownMinutes = ref(0)
const result = ref<CalculationResult | null>(null)
const calculatedAt = ref<Date | null>(null)
const error = ref('')

const helper = computed(() => {
  if (helperType.value === 'lab') {
    return {
      name: '实验助手',
      project: '实验室研究',
      maxLevel: 12,
      description: '为兵种、法术和攻城机器研究加速',
    }
  }

  return {
    name: '建筑工人学徒',
    project: '建筑工人项目',
    maxLevel: 8,
    description: '为建筑、陷阱和英雄等施工项目加速',
  }
})

const levelOptions = computed(() =>
  Array.from({ length: helper.value.maxLevel }, (_, index) => index + 1),
)

const showCooldown = computed(() => workdayState.value !== 'idle')

function chooseHelper(type: HelperType) {
  helperType.value = type
  helperLevel.value = Math.min(helperLevel.value, maxLevelFor(type))
  result.value = null
  error.value = ''
}

type TimeField = 'days' | 'hours' | 'minutes' | 'cooldownHours' | 'cooldownMinutes'

function defaultEmptyToZero(field: TimeField) {
  const fields = { days, hours, minutes, cooldownHours, cooldownMinutes }
  const value = Number(fields[field].value)
  fields[field].value = Number.isFinite(value) ? value : 0
}

function runCalculation() {
  const timeFields: TimeField[] = ['days', 'hours', 'minutes', 'cooldownHours', 'cooldownMinutes']
  timeFields.forEach(defaultEmptyToZero)
  error.value = ''
  const values = [days.value, hours.value, minutes.value, cooldownHours.value, cooldownMinutes.value]

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    error.value = '请输入有效的非负时间。'
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

  const cooldown = cooldownHours.value * 60 + cooldownMinutes.value
  if (showCooldown.value && (cooldown <= 0 || cooldown > 23 * 60)) {
    error.value = '共享倒计时应大于0且不超过23小时。'
    return
  }

  const now = new Date()
  calculatedAt.value = now
  result.value = calculateFinish({
    startAt: now,
    remainingMinutes: remaining,
    helperLevel: helperLevel.value,
    workdayState: workdayState.value,
    cooldownMinutes: showCooldown.value ? cooldown : 0,
  })
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
            <span>按游戏界面填写</span>
          </div>
          <div class="duration-fields">
            <label><input v-model.number="days" type="number" inputmode="numeric" min="0" step="1" @blur="defaultEmptyToZero('days')" /><span>天</span></label>
            <label><input v-model.number="hours" type="number" inputmode="numeric" min="0" max="23" step="1" @blur="defaultEmptyToZero('hours')" /><span>时</span></label>
            <label><input v-model.number="minutes" type="number" inputmode="numeric" min="0" max="59" step="1" @blur="defaultEmptyToZero('minutes')" /><span>分</span></label>
          </div>
        </div>

        <div class="field-group two-columns">
          <label class="select-field">
            <span>帮手等级</span>
            <select v-model.number="helperLevel">
              <option v-for="level in levelOptions" :key="level" :value="level">
                {{ level }}级 · 贡献{{ level }}小时
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
              <option value="used">本轮已经使用</option>
            </select>
          </label>
          <p class="field-hint">{{ stateDescription() }}</p>
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
          <div class="finish-card">
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
            <ol v-if="result.boosts.length" class="boost-list">
              <li v-for="(boost, index) in result.boosts" :key="boost.startsAt.getTime()">
                <span class="boost-index">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="boost-line" aria-hidden="true"></span>
                <div>
                  <strong>{{ formatDateTime(boost.startsAt) }}</strong>
                  <span>
                    {{ boost.partial ? '部分加速' : '完整加速' }} ·
                    贡献{{ formatDuration(boost.helperProgressMinutes) }}
                  </span>
                </div>
              </li>
            </ol>
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
