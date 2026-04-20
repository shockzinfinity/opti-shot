type Handler = (input: any) => Promise<any>

export class QueryBus {
  private handlers = new Map<string, Handler>()

  register(type: string, handler: Handler): void {
    if (this.handlers.has(type)) {
      throw new Error(`Duplicate query handler: ${type}`)
    }
    this.handlers.set(type, handler)
  }

  has(type: string): boolean {
    return this.handlers.has(type)
  }

  registeredTypes(): string[] {
    return [...this.handlers.keys()]
  }

  async execute(type: string, input: unknown): Promise<unknown> {
    const handler = this.handlers.get(type)
    if (!handler) throw new Error(`No handler for query: ${type}`)
    return handler(input)
  }

  unregisterPrefix(prefix: string): void {
    for (const key of this.handlers.keys()) {
      if (key.startsWith(prefix)) {
        this.handlers.delete(key)
      }
    }
  }
}
