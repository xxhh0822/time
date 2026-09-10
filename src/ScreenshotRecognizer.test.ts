// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ScreenshotRecognizer from './ScreenshotRecognizer.vue'
import type { ScreenshotRecognition } from './ocr'

const recognized: ScreenshotRecognition = {
  helperType: { value: 'lab', confidence: 92, rawText: '12级实验助手' },
  nominalLevel: { value: 12, confidence: 92, rawText: '12级实验助手' },
  effectiveLevel: { value: 11, confidence: 92, rawText: '当前效果：11级' },
  state: { value: 'working', confidence: 88, rawText: '剩余时间：59分钟59秒' },
  projects: [{ id: 'project-1', name: '炸弹人', remainingMinutes: 8697, confidence: 85, recommended: true, rawText: '炸弹人 6天57分钟' }],
  cooldownMinutes: { value: null, confidence: 0, rawText: '' },
  activeRemainingMinutes: { value: 60, confidence: 88, rawText: '剩余时间：59分钟59秒' },
  warnings: [],
}

afterEach(() => vi.unstubAllGlobals())

describe('ScreenshotRecognizer', () => {
  it('does not auto-apply and applies without an extra confirmation checkbox', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
    const recognizer = vi.fn(async (_file: File, onProgress?: (value: { progress: number; label: string }) => void) => {
      onProgress?.({ progress: 1, label: '识别完成，请核对结果' })
      return recognized
    })
    const wrapper = mount(ScreenshotRecognizer, { props: { recognizer } })
    const file = new File(['image'], 'helper.png', { type: 'image/png' })

    await wrapper.find('.screenshot-dropzone').trigger('drop', { dataTransfer: { files: [file] } })
    await flushPromises()

    expect((wrapper.find('.project-name-input').element as HTMLInputElement).value).toBe('炸弹人')
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(wrapper.find('.recognition-confirm').exists()).toBe(false)
    expect(wrapper.find('.apply-recognition').attributes('disabled')).toBeUndefined()

    await wrapper.find('.apply-recognition').trigger('click')

    expect(wrapper.emitted('apply')?.[0][0]).toMatchObject({
      helperType: 'lab',
      helperLevel: 11,
      workdayState: 'working',
      remainingMinutes: 8697,
      activeRemainingMinutes: 60,
    })
    expect(wrapper.find('[role="status"]').text()).toContain('已成功应用到下方计算器')
  })

  it('shows recognition failures without changing the manual calculator', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
    const wrapper = mount(ScreenshotRecognizer, {
      props: { recognizer: vi.fn(async () => { throw new Error('无法读取该截图') }) },
    })

    await wrapper.find('.screenshot-dropzone').trigger('drop', {
      dataTransfer: { files: [new File(['image'], 'bad.png', { type: 'image/png' })] },
    })
    await flushPromises()

    expect(wrapper.find('.error-message').text()).toBe('无法读取该截图')
    expect(wrapper.emitted('apply')).toBeUndefined()
  })
})
