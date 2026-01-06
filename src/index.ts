/// <reference types="@cloudflare/workers-types" />

type AnalyzeBody = {
  imageBase64: string
  language?: 'id' | 'en'
}

type ContextualBody = {
  imageBase64: string
  context: string
  language?: 'id' | 'en'
}

const corsHeaders: HeadersInit = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export default {
  async fetch(
    req: Request,
    env: { GEMINI_API_KEY: string }
  ): Promise<Response> {
    const url = new URL(req.url)

    // =========================
    // CORS PREFLIGHT
    // =========================
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // =========================
    // HEALTH CHECK
    // =========================
    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'grafotest-api' }),
        { headers: corsHeaders }
      )
    }

    // =========================
    // ANALYZE (GEMINI FULL)
    // =========================
    if (req.method === 'POST' && url.pathname === '/analyze') {
      try {
        const body = (await req.json()) as AnalyzeBody
        const { imageBase64, language = 'id' } = body

        if (!imageBase64) {
          return new Response(
            JSON.stringify({ error: 'Image is required' }),
            { status: 400, headers: corsHeaders }
          )
        }

        if (!env.GEMINI_API_KEY) {
          return new Response(
            JSON.stringify({ error: 'Gemini API key not set' }),
            { status: 500, headers: corsHeaders }
          )
        }

        const langInstruction =
          language === 'en'
            ? 'Use English.'
            : 'Gunakan Bahasa Indonesia.'

        const prompt = `
${langInstruction}

Anda adalah analis grafologi profesional.

TUGAS:
Analisis tulisan tangan dari gambar berdasarkan prinsip grafologi.

WAJIB keluarkan JSON VALID dengan struktur berikut:
{
  "personalitySummary": string,
  "traits": [
    {
      "feature": string,
      "observation": string,
      "interpretation": string,
      "confidence": number
    }
  ],
  "strengths": string[],
  "weaknesses": string[],
  "graphologyBasis": string[]
}

ATURAN:
- JANGAN menulis teks di luar JSON
- Semua array minimal 3 item
- confidence antara 0.4 – 0.9
- Bersifat probabilistik
`

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inline_data: {
                        mime_type: 'image/jpeg',
                        data: imageBase64.replace(
                          /^data:image\/\w+;base64,/,
                          ''
                        )
                      }
                    }
                  ]
                }
              ]
            })
          }
        )

        if (!geminiRes.ok) {
          const errText = await geminiRes.text()
          console.error('GEMINI HTTP ERROR:', geminiRes.status, errText)
          throw new Error('Gemini API error')
        }

        const data: any = await geminiRes.json()

        const rawText =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            .join('\n') ?? ''

        if (!rawText) {
          console.error('EMPTY GEMINI RESPONSE:', data)
          throw new Error('Empty Gemini response')
        }

        const start = rawText.indexOf('{')
        const end = rawText.lastIndexOf('}')

        if (start === -1 || end === -1) {
          console.error('NO JSON FOUND:', rawText)
          throw new Error('Invalid JSON output')
        }

        const parsed = JSON.parse(rawText.slice(start, end + 1))

        return new Response(JSON.stringify(parsed), {
          headers: corsHeaders
        })
      } catch (err) {
        console.error('ANALYZE ERROR:', err)
        return new Response(
          JSON.stringify({ error: 'AI analysis failed' }),
          { status: 500, headers: corsHeaders }
        )
      }
    }

    // =========================
    // ANALYZE CONTEXTUAL
    // =========================
    if (
      req.method === 'POST' &&
      url.pathname === '/analyze-contextual'
    ) {
      try {
        const body = (await req.json()) as ContextualBody
        const { imageBase64, context, language = 'id' } = body

        if (!imageBase64 || !context) {
          return new Response(
            JSON.stringify({
              error: 'imageBase64 dan context wajib diisi'
            }),
            { status: 400, headers: corsHeaders }
          )
        }

        const langInstruction =
          language === 'en'
            ? 'Use English.'
            : 'Gunakan Bahasa Indonesia.'

        const prompt = `
${langInstruction}

Anda adalah analis grafologi profesional.

KONTEKS:
"${context}"

TUGAS:
1. Nilai kecocokan karakter dengan konteks
2. Berikan skor 0–100
3. Jelaskan relevansi
4. Berikan saran
5. Sebutkan potensi risiko

FORMAT JSON VALID:
{
  "suitabilityScore": number,
  "relevanceExplanation": string,
  "actionableAdvice": string[],
  "specificRisks": string[]
}

ATURAN:
- Tidak ada teks di luar JSON
- Semua array minimal 2 item
`

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inline_data: {
                        mime_type: 'image/jpeg',
                        data: imageBase64.replace(
                          /^data:image\/\w+;base64,/,
                          ''
                        )
                      }
                    }
                  ]
                }
              ]
            })
          }
        )

        if (!geminiRes.ok) {
          const errText = await geminiRes.text()
          console.error(
            'GEMINI CONTEXTUAL ERROR:',
            geminiRes.status,
            errText
          )
          throw new Error('Gemini API error')
        }

        const data: any = await geminiRes.json()

        const rawText =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            .join('\n') ?? ''

        if (!rawText) {
          console.error('EMPTY CONTEXTUAL RESPONSE:', data)
          throw new Error('Empty Gemini response')
        }

        const start = rawText.indexOf('{')
        const end = rawText.lastIndexOf('}')

        if (start === -1 || end === -1) {
          console.error('INVALID JSON CONTEXTUAL:', rawText)
          throw new Error('Invalid JSON output')
        }

        const parsed = JSON.parse(rawText.slice(start, end + 1))

        return new Response(JSON.stringify(parsed), {
          headers: corsHeaders
        })
      } catch (err) {
        console.error('CONTEXTUAL ERROR:', err)
        return new Response(
          JSON.stringify({
            suitabilityScore: 0,
            relevanceExplanation:
              'Terjadi kegagalan analisis kontekstual.',
            actionableAdvice: [],
            specificRisks: []
          }),
          { status: 500, headers: corsHeaders }
        )
      }
    }

    // =========================
    // NOT FOUND
    // =========================
    return new Response(
      JSON.stringify({ error: 'Not Found' }),
      { status: 404, headers: corsHeaders }
    )
  }
}
