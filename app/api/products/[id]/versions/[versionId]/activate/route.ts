import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken, unauthorized } from '@/utils/supabase/auth'
import { callopsPost, callopsErrorResponse } from '@/utils/callops'

export const dynamic = 'force-dynamic'

// Roll back / promote a product to a specific script version.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params
  const { token } = await getAccessToken()
  if (!token) return unauthorized()
  try {
    const data = await callopsPost(`/products/${id}/versions/${versionId}/activate`, token)
    return NextResponse.json(data)
  } catch (e) {
    return callopsErrorResponse(e)
  }
}
