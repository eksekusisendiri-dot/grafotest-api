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

/**
 * 🔒 Robust Gemini JSON extractor
 * - Aman jika Gemini menambah teks
 * - Aman jika multiline
 * - Aman jika JSON dibungkus penjelasan
 */
function extractJsonSafely(rawText: string) {
  // 1️⃣ Coba parse langsung
  try {
    return JSON.parse(rawText)
  } catch {}

  // 2️⃣ Cari blok JSON pertama–terakhir
  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('No JSON found in Gemini output')
  }

  return JSON.parse(match[0])
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
    // ANALYZE (GEMINI)
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
          throw new Error('GEMINI_API_KEY not set')
        }

        const langInstruction =
          language === 'en'
            ? 'Use English.'
            : 'Gunakan Bahasa Indonesia.'

        const prompt = `
${langInstruction}

Anda adalah analis grafologi profesional.

TUGAS:
Analisis tulisan tangan berdasarkan prinsip grafologi.

WAJIB keluarkan JSON VALID dengan struktur:
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
          const err = await geminiRes.text()
          console.error('GEMINI HTTP ERROR:', geminiRes.status, err)
          throw new Error('Gemini HTTP error')
        }

        const data: any = await geminiRes.json()

        const rawText =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            ?.join('\n') ?? ''

        if (!rawText) {
          console.error('EMPTY GEMINI RESPONSE:', data)
          throw new Error('Empty Gemini response')
        }

        const parsed = extractJsonSafely(rawText)

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

        if (!env.GEMINI_API_KEY) {
          throw new Error('GEMINI_API_KEY not set')
        }

        const langInstruction =
          language === 'en'
            ? 'Use English.'
            : 'Gunakan Bahasa Indonesia.'

        const prompt = `
${langInstruction}

KONTEKS:
"${context}"

TUGAS:
Nilai kecocokan karakter tulisan tangan dengan konteks.

FORMAT JSON:
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
          const err = await geminiRes.text()
          console.error(
            'GEMINI CONTEXTUAL ERROR:',
            geminiRes.status,
            err
          )
          throw new Error('Gemini HTTP error')
        }

        const data: any = await geminiRes.json()

        const rawText =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text)
            ?.join('\n') ?? ''

        if (!rawText) {
          throw new Error('Empty Gemini response')
        }

        const parsed = extractJsonSafely(rawText)

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
