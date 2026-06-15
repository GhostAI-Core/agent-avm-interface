export function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: number; message?: string }
  return e?.code === 6 || String(e?.message || err).includes('ALREADY_EXISTS')
}

export async function upsertResource<T extends { ref?: string }, R extends { ref: string }>(
  ref: string,
  getFn: (ref: string) => Promise<unknown>,
  createFn: (payload: T & { ref: string }) => Promise<R>,
  updateFn: (payload: T & { ref: string }) => Promise<R>,
  payload: T,
  resolveExistingRef?: () => Promise<string | undefined>,
  log: (msg: string) => void = () => {},
): Promise<R> {
  const body = { ...payload } as T & { ref?: string }
  delete body.ref

  const update = async (targetRef: string, note?: string) => {
    const suffix = note ? ` (${note})` : ''
    log(`[routr] update ${targetRef}${suffix}`)
    return updateFn({ ref: targetRef, ...body })
  }

  try {
    await getFn(ref)
    return update(ref)
  } catch {
    try {
      log(`[routr] create ${ref}`)
      return await createFn({ ref, ...body })
    } catch (err) {
      if (!isAlreadyExists(err) || !resolveExistingRef) throw err
      const existingRef = await resolveExistingRef()
      if (!existingRef) throw err
      return update(existingRef, 'existing resource')
    }
  }
}
