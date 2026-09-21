import GuideShareClient from '@/components/guide-share-client'

export default async function GuideSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <GuideShareClient token={token} mapToken={(process.env.api || '').trim()} />
}