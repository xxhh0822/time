// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import App from './App.vue'

describe('App', () => {
  it('starts with zero time values and an immediately available helper', async () => {
    const wrapper = mount(App)
    const selects = wrapper.findAll('select')

    expect((selects[1].element as HTMLSelectElement).value).toBe('idle')
    expect(wrapper.find('.cooldown-group').exists()).toBe(false)
    expect(
      wrapper.findAll('input[type="number"]').map((input) => (input.element as HTMLInputElement).value),
    ).toEqual(['0', '0', '0'])

    await selects[1].setValue('used')

    const inputs = wrapper.findAll('input[type="number"]')
    expect(inputs.map((input) => (input.element as HTMLInputElement).value)).toEqual(['0', '0', '0', '0', '0'])
    expect(inputs.every((input) => input.attributes('inputmode') === 'numeric')).toBe(true)
  })

  it('restores a cleared time field to zero on blur', async () => {
    const wrapper = mount(App)
    const days = wrapper.find('input[type="number"]')

    await days.setValue('')
    await days.trigger('blur')

    expect((days.element as HTMLInputElement).value).toBe('0')
  })

  it('clears an existing result when an input changes', async () => {
    const wrapper = mount(App)
    const days = wrapper.find('input[type="number"]')

    await days.setValue('1')
    await wrapper.find('.calculate-button').trigger('click')
    expect(wrapper.find('.result-content').exists()).toBe(true)
    expect(wrapper.find('.finish-card').classes()).toContain('lab')
    expect(wrapper.find('.boost-list').exists()).toBe(true)
    expect(wrapper.find('.no-boost').exists()).toBe(false)

    await days.setValue('2')
    expect(wrapper.find('.result-content').exists()).toBe(false)
    expect(wrapper.find('.empty-result').exists()).toBe(true)
  })

  it('shows the current-session field only while the helper is working', async () => {
    const wrapper = mount(App)
    const state = wrapper.findAll('select')[1]

    await state.setValue('working')
    expect(wrapper.find('.active-work-group').exists()).toBe(true)
    expect(wrapper.find('.cooldown-group:not(.active-work-group)').exists()).toBe(false)

    await state.setValue('used')
    expect(wrapper.find('.active-work-group').exists()).toBe(false)
    expect(wrapper.find('.cooldown-group').exists()).toBe(true)
  })

  it('applies the builder result layout when the builder apprentice is selected', async () => {
    const wrapper = mount(App)

    await wrapper.findAll('.helper-option')[1].trigger('click')
    await wrapper.find('input[type="number"]').setValue('1')
    await wrapper.find('.calculate-button').trigger('click')

    expect(wrapper.find('.finish-card').classes()).toContain('builder')
    expect(wrapper.find('.result-character').classes()).toContain('builder')
  })

  it('rejects fractional values and durations over 365 days', async () => {
    const wrapper = mount(App)
    const days = wrapper.find('input[type="number"]')
    const calculate = wrapper.find('.calculate-button')

    await days.setValue('1.5')
    await calculate.trigger('click')
    expect(wrapper.find('.error-message').text()).toContain('整数')

    await days.setValue('366')
    await calculate.trigger('click')
    expect(wrapper.find('.error-message').text()).toContain('不能超过365天')
  })

  it('collapses long boost schedules and can expand them', async () => {
    const wrapper = mount(App)
    const days = wrapper.find('input[type="number"]')
    const level = wrapper.findAll('select')[0]

    await days.setValue('30')
    await level.setValue('1')
    await wrapper.find('.calculate-button').trigger('click')

    expect(wrapper.find('.boost-omitted').exists()).toBe(true)
    expect(wrapper.findAll('.boost-list > li')).toHaveLength(12)

    const toggle = wrapper.find('.schedule-toggle')
    expect(toggle.text()).toContain('展开全部')
    await toggle.trigger('click')

    expect(wrapper.find('.boost-omitted').exists()).toBe(false)
    expect(wrapper.findAll('.boost-list > li').length).toBeGreaterThan(12)
    expect(toggle.text()).toBe('收起记录')
  })
})
