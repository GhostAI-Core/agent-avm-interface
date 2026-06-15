export function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: number; message?: string }
  return e?.code === 6 || String(e?.message || err).includes('ALREADY_EXISTS')
}

export type UpsertOptions = {
  /** Routr Create*Request messages do not accept client ref — server assigns UUID. */
  omitRefOnCreate?: boolean
  /** e.g. peer UpdatePeerRequest has no username field */
  omitFieldsOnUpdate?: string[]
}

export async function upsertResource<T extends { ref?: string }, R extends { ref: string }>(
  ref: string,
  getFn: (ref: string) => Promise<unknown>,
  createFn: (payload: T & { ref: string }) => Promise<R>,
  updateFn: (payload: T & { ref: string }) => Promise<R>,
  payload: T,
  resolveExistingRef?: () => Promise<string | undefined>,
  log: (msg: string) => void = () => {},
  options: UpsertOptions = {},
): Promise<R> {
  const body = { ...payload } as T & { ref?: string }
  delete body.ref

  const buildUpdate = (targetRef: string) => {
    const updatePayload = { ref: targetRef, ...body } as T & { ref: string }
    for (const field of options.omitFieldsOnUpdate ?? []) {
      delete (updatePayload as Record<string, unknown>)[field]
    }
    return updatePayload
  }

  const update = async (targetRef: string, note?: string) => {
    const suffix = note ? ` (${note})` : ''
    log(`[routr] update ${targetRef}${suffix}`)
    return updateFn(buildUpdate(targetRef))
  }

  const create = async () => {
    log(`[routr] create ${ref}`)
    if (options.omitRefOnCreate) {
      return createFn(body as T & { ref: string })
    }
    return createFn({ ref, ...body })
  }

  try {
    await getFn(ref)
    return update(ref)
  } catch {
    try {
      return await create()
    } catch (err) {
      if (!isAlreadyExists(err) || !resolveExistingRef) throw err
      const existingRef = await resolveExistingRef()
      if (!existingRef) throw err
      return update(existingRef, 'existing resource')
    }
  }
}
