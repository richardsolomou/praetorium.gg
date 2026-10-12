import { useEffect, useState } from 'react'

/** A QR image of `text` while it is set, or `failed` when the text does not fit or the encoder cannot load. */
export function useQrCode(text: string | null, width: number, errorCorrectionLevel: 'L' | 'M' = 'M') {
  const [image, setImage] = useState<{ text: string; data: string } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    if (!text) return
    let active = true
    setFailed(null)
    void import('qrcode')
      .then(({ default: qr }) => qr.toDataURL(text, { width, margin: 2, errorCorrectionLevel }))
      .then((data) => {
        if (active) setImage({ text, data })
      })
      .catch(() => {
        if (active) setFailed(text)
      })
    return () => {
      active = false
    }
  }, [text, width, errorCorrectionLevel])
  return { image: image && image.text === text ? image.data : null, failed: failed !== null && failed === text }
}
