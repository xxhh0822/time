import { describe, expect, it } from 'vitest'
import { parseChineseDuration, parseRecognitionTexts } from './ocr'

describe('parseChineseDuration', () => {
  it('parses Chinese day, hour, minute and rounds seconds upward', () => {
    expect(parseChineseDuration('1天23小时58分钟')).toBe(2878)
    expect(parseChineseDuration('59分钟58秒')).toBe(60)
    expect(parseChineseDuration('11秒')).toBe(1)
  })
})

describe('parseRecognitionTexts', () => {
  it('keeps a project name even when its outlined time cannot be read safely', () => {
    const result = parseRecognitionTexts({
      header: '吕 级 建筑 工人 学 徒',
      projects: '进行 中 的 项 目\n节省 时 间 : 24 秒\n炸弹 塔\nMA\n迫 击 炮',
      status: '剩余 时 间 :\n595 58%',
      confidence: 62,
    })

    expect(result.projects[0]?.name).toBe('炸弹塔')
    expect(result.projects[0]?.recommended).toBe(true)
    expect(result.activeRemainingMinutes.value).toBe(60)
  })

  it('normalizes observed outlined-level OCR confusions', () => {
    const result = parseRecognitionTexts({
      header: 'Te 级 实验 助手 - 当前 效果 : ff 级',
      projects: '炸弹 人',
      status: '剩余 时 间 :\n595 59%',
      confidence: 68,
    })

    expect(result.nominalLevel.value).toBe(12)
    expect(result.effectiveLevel.value).toBe(11)
    expect(result.activeRemainingMinutes.value).toBe(60)
  })

  it('normalizes observed idle and waiting status OCR confusions', () => {
    const idle = parseRecognitionTexts({
      header: '吕 级 建筑 工人 学 徒',
      projects: '炸弹 塔',
      status: '空 采 中 !',
    })
    const waiting = parseRecognitionTexts({
      header: '12 级 实验 助手',
      projects: '法 师',
      status: '需 等 待 :\n10/83 38 分 钟',
    })

    expect(idle.state.value).toBe('idle')
    expect(waiting.state.value).toBe('used')
    expect(waiting.cooldownMinutes.value).toBe(10 * 60 + 38)
    expect(waiting.projects[0]?.remainingMinutes).toBeNull()
  })

  it.each([
    {
      name: '建筑工人学徒正在工作',
      header: '8级建筑工人学徒',
      projects: '进行中的项目\n炸弹塔 1天23小时58分钟',
      status: '剩余时间：59分钟58秒',
      helper: 'builder', state: 'working', level: 8, timer: 60,
    },
    {
      name: '实验助手需等待',
      header: '12级实验助手',
      projects: '进行中的升级\n法师 6天18小时52分钟',
      status: '需等待：10小时38分钟',
      helper: 'lab', state: 'used', level: 12, timer: 638,
    },
    {
      name: '建筑工人学徒需等待并有多个项目',
      header: '7级建筑工人学徒',
      projects: '防空火箭 9天22小时17分钟\n防空火箭 8天11小时39分钟\n飞盾战神 4天10小时31分钟\n战宠小屋 3天5小时9分钟',
      status: '需等待：14小时15分钟',
      helper: 'builder', state: 'used', level: 7, timer: 855,
    },
    {
      name: '实验助手正在工作且当前效果低一级',
      header: '12级实验助手 - 当前效果：11级',
      projects: '进行中的项目 当前段位仅生效11级加速效果\n炸弹人 6天57分钟',
      status: '剩余时间：59分钟59秒',
      helper: 'lab', state: 'working', level: 11, timer: 60,
    },
    {
      name: '建筑工人学徒空闲',
      header: '8级建筑工人学徒',
      projects: '指派建筑工人学徒？\n迫击炮 7天13小时24分钟\n迫击炮 2天19小时40分钟\n炸弹塔 1天23小时58分钟',
      status: '空闲中！',
      helper: 'builder', state: 'idle', level: 8, timer: null,
    },
    {
      name: '实验助手空闲且当前效果低一级',
      header: '12级实验助手 - 当前效果：11级',
      projects: '指派实验助手？ 当前段位仅生效11级加速效果\n炸弹人 6天57分钟',
      status: '空闲中！',
      helper: 'lab', state: 'idle', level: 11, timer: null,
    },
  ])('$name', ({ header, projects, status, helper, state, level, timer }) => {
    const result = parseRecognitionTexts({ header, projects, status, confidence: 86 })

    expect(result.helperType.value).toBe(helper)
    expect(result.state.value).toBe(state)
    expect(result.effectiveLevel.value).toBe(level)
    expect(result.projects.length).toBeGreaterThan(0)
    if (state === 'used') expect(result.cooldownMinutes.value).toBe(timer)
    if (state === 'working') expect(result.activeRemainingMinutes.value).toBe(timer)
  })
})
