import { describe, it, expect } from 'vitest'
import { QueryBus } from '@main/cqrs/queryBus'

describe('QueryBus', () => {
  it('registers and executes a handler', async () => {
    const bus = new QueryBus()
    bus.register('test.query', async (input: any) => [1, 2, input.limit])

    const result = await bus.execute('test.query', { limit: 3 })
    expect(result).toEqual([1, 2, 3])
  })

  it('throws on duplicate registration', () => {
    const bus = new QueryBus()
    bus.register('test.query', async () => [])
    expect(() => bus.register('test.query', async () => [])).toThrow('Duplicate query handler')
  })

  it('throws on unknown query', async () => {
    const bus = new QueryBus()
    await expect(bus.execute('nonexistent', {})).rejects.toThrow('No handler for query')
  })

  it('has() returns correct status', () => {
    const bus = new QueryBus()
    expect(bus.has('test.query')).toBe(false)
    bus.register('test.query', async () => [])
    expect(bus.has('test.query')).toBe(true)
  })

  it('unregisterPrefix() removes matching handlers', () => {
    const bus = new QueryBus()
    bus.register('plugin.bar.list', async () => [])
    bus.register('plugin.bar.detail', async () => ({}))
    bus.register('core.query', async () => [])

    bus.unregisterPrefix('plugin.bar.')
    expect(bus.has('plugin.bar.list')).toBe(false)
    expect(bus.has('core.query')).toBe(true)
  })
})
