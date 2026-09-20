import OwnerShareClient from '@/components/owner-share-client'

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <OwnerShareClient token={token} mapToken={(process.env.api || '').trim()} />
}