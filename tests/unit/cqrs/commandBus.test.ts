import { describe, it, expect } from 'vitest'
import { CommandBus } from '@main/cqrs/commandBus'

describe('CommandBus', () => {
  it('registers and executes a handler', async () => {
    const bus = new CommandBus()
    bus.register('test.cmd', async (input: any) => ({ result: input.value * 2 }))

    const result = await bus.execute('test.cmd', { value: 5 })
    expect(result).toEqual({ result: 10 })
  })

  it('throws on duplicate registration', () => {
    const bus = new CommandBus()
    bus.register('test.cmd', async () => {})
    expect(() => bus.register('test.cmd', async () => {})).toThrow('Duplicate command handler')
  })

  it('throws on unknown command', async () => {
    const bus = new CommandBus()
    await expect(bus.execute('nonexistent', {})).rejects.toThrow('No handler for command')
  })

  it('has() returns correct status', () => {
    const bus = new CommandBus()
    expect(bus.has('test.cmd')).toBe(false)
    bus.register('test.cmd', async () => {})
    expect(bus.has('test.cmd')).toBe(true)
  })

  it('registeredTypes() returns all registered types', () => {
    const bus = new CommandBus()
    bus.register('a.cmd', async () => {})
    bus.register('b.cmd', async () => {})
    expect(bus.registeredTypes()).toEqual(['a.cmd', 'b.cmd'])
  })

  it('unregisterPrefix() removes matching handlers', () => {
    const bus = new CommandBus()
    bus.register('plugin.foo.start', async () => {})
    bus.register('plugin.foo.stop', async () => {})
    bus.register('core.cmd', async () => {})

    bus.unregisterPrefix('plugin.foo.')
    expect(bus.has('plugin.foo.start')).toBe(false)
    expect(bus.has('plugin.foo.stop')).toBe(false)
    expect(bus.has('core.cmd')).toBe(true)
  })

  it('propagates handler errors', async () => {
    const bus = new CommandBus()
    bus.register('fail.cmd', async () => { throw new Error('boom') })
    await expect(bus.execute('fail.cmd', {})).rejects.toThrow('boom')
  })
})
