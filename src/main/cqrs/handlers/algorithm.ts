import { algorithmRegistry } from '@main/engine/algorithm-registry'
import type { QueryBus } from '../queryBus'
import type { AlgorithmInfo } from '@shared/plugins'

export function registerAlgorithmHandlers(qry: QueryBus): void {
  qry.register('algorithm.list', async () => {
    const hashAlgos: AlgorithmInfo[] = algorithmRegistry.listHash().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      detailDescription: a.detailDescription,
      version: a.version,
      stage: 'hash' as const,
      defaultThreshold: a.defaultThreshold,
    }))

    const verifyAlgos: AlgorithmInfo[] = algorithmRegistry.listVerify().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      detailDescription: a.detailDescription,
      version: a.version,
      stage: 'verify' as const,
      defaultThreshold: a.defaultThreshold,
    }))

    return [...hashAlgos, ...verifyAlgos]
  })
}
