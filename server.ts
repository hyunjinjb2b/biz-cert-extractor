import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';

type ExtractedData = {
  Company_Code: string;
  Client_Type: string;
  Client_Code: string;
  Company_Name: string;
  Company_Name_Abbrev: string;
  Business_Number: string;
  CEO_Name: string;
  Business_Type: string;
  Business_Sector: string;
  Zip_Code: string;
  Address_Detail_1: string;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const PORT = Number(process.env.PORT || 3000);
const OCR_MODEL = process.env.UBION_VISION_MODEL || process.env.OCR_MODEL || 'mimo-v2.5';
const UBION_LITELLM_URL = process.env.UBION_LITELLM_URL;
const UBION_LITELLM_KEY = process.env.UBION_LITELLM_KEY;

const REQUIRED_FIELDS: Array<keyof ExtractedData> = [
  'Company_Code',
  'Client_Type',
  'Client_Code',
  'Company_Name',
  'Company_Name_Abbrev',
  'Business_Number',
  'CEO_Name',
  'Business_Type',
  'Business_Sector',
  'Zip_Code',
  'Address_Detail_1',
];

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} 환경변수가 설정되어 있지 않습니다.`);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

function parseExtractedData(responseText: string, context: string) {
  try {
    const jsonText = extractJsonObject(responseText);
    const parsed = JSON.parse(jsonText);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SyntaxError('Parsed JSON is not an object.');
    }

    return normalizeExtractedData(parsed as Partial<ExtractedData>);
  } catch (error) {
    const parseError = new SyntaxError(`${context}: ${getErrorMessage(error)}`);
    (parseError as any).rawResponse = responseText;
    throw parseError;
  }
}

function normalizeExtractedData(input: Partial<ExtractedData>): ExtractedData {
  const data = Object.fromEntries(
    REQUIRED_FIELDS.map((field) => [field, String(input[field] ?? '').trim()])
  ) as ExtractedData;

  data.Company_Code = '1000';
  data.Client_Type = '1';
  data.Client_Code = '';
  data.Company_Name_Abbrev = data.Company_Name;

  return data;
}

function countFilledFields(data: ExtractedData, fields: Array<keyof ExtractedData>) {
  return fields.filter((field) => data[field].trim().length > 0).length;
}

function validateExtractedDataQuality(data: ExtractedData, fileName: string) {
  const keyFields: Array<keyof ExtractedData> = [
    'Company_Name',
    'Business_Number',
    'CEO_Name',
    'Business_Type',
    'Business_Sector',
    'Address_Detail_1',
  ];

  const filledKeyFieldCount = countFilledFields(data, keyFields);
  const hasPrimaryIdentifier = Boolean(data.Company_Name.trim() || data.Business_Number.trim());

  if (!hasPrimaryIdentifier || filledKeyFieldCount < 2) {
    console.warn(`[${OCR_MODEL}] Low quality extraction for "${fileName}": ${JSON.stringify(data)}`);
    throw new Error(
      'AI가 문서에서 충분한 정보를 추출하지 못했습니다. 파일 옆 재시도를 눌러 다시 분석해 주세요.'
    );
  }
}

function logRawAiResponse(fileName: string, reason: string, responseText: string) {
  const preview = responseText ? responseText.slice(0, 4000) : '[empty response]';
  console.error(`[${OCR_MODEL}] JSON parse failed for "${fileName}": ${reason}`);
  console.error(`[${OCR_MODEL}] Raw AI response for "${fileName}" (first 4000 chars):\n${preview}`);
}

function getKakaoSearchQuery(address: string) {
  let cleanQuery = address.trim();
  const commaIndex = cleanQuery.indexOf(',');
  const parenIndex = cleanQuery.indexOf('(');

  let cutIndex = -1;
  if (commaIndex !== -1 && parenIndex !== -1) cutIndex = Math.min(commaIndex, parenIndex);
  else if (commaIndex !== -1) cutIndex = commaIndex;
  else if (parenIndex !== -1) cutIndex = parenIndex;

  if (cutIndex !== -1) cleanQuery = cleanQuery.substring(0, cutIndex).trim();
  return cleanQuery;
}

async function findZipCode(address: string) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey || !address.trim()) return null;

  const query = getKakaoSearchQuery(address);
  console.log(`Kakao address lookup: [${query}] from [${address}]`);

  const kakaoRes = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `KakaoAK ${apiKey}` } }
  );

  if (!kakaoRes.ok) {
    console.error(`Kakao API error: ${kakaoRes.status} ${await kakaoRes.text()}`);
    return null;
  }

  const kakaoData = await kakaoRes.json();
  const doc = kakaoData.documents?.[0];
  return doc?.road_address?.zone_no || doc?.address?.zip_code || null;
}

function createOcrPrompt() {
  return `You are an expert OCR system for Korean business registration certificates.
Extract information from the attached certificate image or PDF and return ONLY one valid JSON object.
Do not include markdown, comments, or code fences.

Extraction rules:
1. Company_Code must always be "1000".
2. Client_Type must always be "1".
3. Client_Code must always be "".
4. Company_Name must be the exact legal name or business name shown on the certificate.
5. Company_Name_Abbrev must be exactly identical to Company_Name.
6. Business_Number must use the format XXX-XX-XXXXX if visible.
7. CEO_Name must be the representative name.
8. Business_Type must be the first or primary business type only.
9. Business_Sector must be the first or primary business sector only.
10. Zip_Code must be the 5-digit postal code if visible.
11. Address_Detail_1 must be the complete business address.

Required JSON shape:
{
  "Company_Code": "1000",
  "Client_Type": "1",
  "Client_Code": "",
  "Company_Name": "",
  "Company_Name_Abbrev": "",
  "Business_Number": "",
  "CEO_Name": "",
  "Business_Type": "",
  "Business_Sector": "",
  "Zip_Code": "",
  "Address_Detail_1": ""
}`;
}

function isPdf(file: Express.Multer.File) {
  return file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
}

async function createPdfVisionContent(file: Express.Multer.File) {
  const parser = new PDFParse({ data: file.buffer });
  try {
    let extractedText = '';
    let imageUrls: string[] = [];

    try {
      const textResult = await parser.getText({ first: 2 });
      extractedText = textResult.text.trim();
    } catch (error) {
      console.warn(`PDF text extraction failed for ${file.originalname}:`, error);
    }

    try {
      const screenshotResult = await parser.getScreenshot({
        first: 2,
        scale: 2,
        imageDataUrl: true,
        imageBuffer: false,
      });
      imageUrls = screenshotResult.pages.map((page) => page.dataUrl).filter(Boolean);
    } catch (error) {
      console.warn(`PDF image rendering failed for ${file.originalname}:`, error);
    }

    if (!extractedText && imageUrls.length === 0) {
      throw new Error('PDF 내용을 읽거나 이미지로 변환하지 못했습니다.');
    }

    return [
      {
        type: 'text',
        text: `${createOcrPrompt()}

The uploaded PDF has been rendered into page images below. Use the page images as the primary OCR source.
If extracted PDF text is provided, use it only as a secondary reference.

Extracted PDF text:
${extractedText.slice(0, 12000)}`,
      },
      ...imageUrls.map((url) => ({
        type: 'image_url',
        image_url: {
          url,
          detail: 'high',
        },
      })),
    ];
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function createVisionContent(file: Express.Multer.File) {
  if (isPdf(file)) {
    return createPdfVisionContent(file);
  }

  const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  return [
    { type: 'text', text: createOcrPrompt() },
    {
      type: 'image_url',
      image_url: {
        url: dataUrl,
        detail: 'high',
      },
    },
  ];
}

function createJsonRepairPrompt(rawResponse: string, fileName: string, reason: string) {
  return `The OCR response below could not be parsed as JSON.
Convert it into exactly one valid JSON object matching the required schema.

Rules:
- Return JSON only.
- Do not include markdown, comments, explanations, or code fences.
- Every field must exist and every value must be a string.
- If a value is unknown or missing, use an empty string.
- Company_Code must be "1000".
- Client_Type must be "1".
- Client_Code must be "".
- Company_Name_Abbrev must equal Company_Name.

Required JSON shape:
{
  "Company_Code": "1000",
  "Client_Type": "1",
  "Client_Code": "",
  "Company_Name": "",
  "Company_Name_Abbrev": "",
  "Business_Number": "",
  "CEO_Name": "",
  "Business_Type": "",
  "Business_Sector": "",
  "Zip_Code": "",
  "Address_Detail_1": ""
}

File name:
${fileName}

Parse failure:
${reason}

OCR response to repair:
${rawResponse.slice(0, 16000)}`;
}

async function repairExtractedDataJson(
  ai: OpenAI,
  file: Express.Multer.File,
  rawResponse: string,
  parseError: unknown
) {
  const reason = getErrorMessage(parseError);
  logRawAiResponse(file.originalname, reason, rawResponse);

  const response = await ai.chat.completions.create({
    model: OCR_MODEL,
    messages: [
      {
        role: 'user',
        content: createJsonRepairPrompt(rawResponse, file.originalname, reason),
      },
    ],
    max_tokens: 1200,
    temperature: 0,
  });

  const repairedText = response.choices[0]?.message?.content ?? '';

  try {
    return parseExtractedData(repairedText, 'JSON repair response');
  } catch (repairError) {
    logRawAiResponse(file.originalname, `JSON repair failed: ${getErrorMessage(repairError)}`, repairedText);
    throw repairError;
  }
}

async function callMimoVision(ai: OpenAI, file: Express.Multer.File) {
  let retries = 5;
  let delayMs = 2000;
  let lastError: unknown;

  for (let i = 0; i < retries; i += 1) {
    try {
      const response = await ai.chat.completions.create({
        model: OCR_MODEL,
        messages: [
          {
            role: 'user',
            content: (await createVisionContent(file)) as any,
          },
        ],
        max_tokens: 1200,
        temperature: 0,
      });

      const responseText = response.choices[0]?.message?.content ?? '';
      try {
        return parseExtractedData(responseText, 'OCR response');
      } catch (parseError) {
        try {
          return await repairExtractedDataJson(ai, file, responseText, parseError);
        } catch (repairError) {
          lastError = repairError;
          console.warn(
            `[${OCR_MODEL} OCR JSON repair attempt ${i + 1} failed] file=${file.originalname}, message=${getErrorMessage(repairError)}`
          );

          if (i < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs *= 2;
            continue;
          }

          throw new Error(
            `AI response could not be converted to JSON for ${file.originalname}. Last error: ${getErrorMessage(repairError)}`
          );
        }
      }
    } catch (apiError: any) {
      lastError = apiError;
      const status = apiError?.status;
      const message = getErrorMessage(apiError);
      const lowerMessage = message.toLowerCase();
      const isRetryable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        lowerMessage.includes('rate') ||
        lowerMessage.includes('overload') ||
        lowerMessage.includes('timeout');

      console.warn(`[${OCR_MODEL} OCR attempt ${i + 1} failed] status=${status}, message=${message}`);

      if (isRetryable && i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
        continue;
      }

      if (apiError instanceof SyntaxError) {
        throw new Error('AI 응답을 JSON으로 해석하지 못했습니다. 파일 상태를 확인한 뒤 다시 시도해주세요.');
      }

      throw apiError;
    }
  }

  throw new Error(`AI OCR 결과를 받을 수 없습니다. 마지막 오류: ${getErrorMessage(lastError)}`);
}

async function startServer() {
  requireEnv('UBION_LITELLM_URL', UBION_LITELLM_URL);
  requireEnv('UBION_LITELLM_KEY', UBION_LITELLM_KEY);

  const app = express();
  const ai = new OpenAI({
    apiKey: UBION_LITELLM_KEY,
    baseURL: `${UBION_LITELLM_URL}/v1`,
  });

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      model: OCR_MODEL,
      provider: 'ubion-litellm',
    });
  });

  app.get('/api/test-kakao', async (req, res) => {
    try {
      const apiKey = process.env.KAKAO_REST_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          ok: false,
          error: 'KAKAO_REST_API_KEY 환경변수가 설정되어 있지 않습니다.',
        });
      }

      const addressQuery = (req.query.address as string) || '서울특별시 중구 세종대로 110';
      const kakaoRes = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addressQuery)}`,
        { headers: { Authorization: `KakaoAK ${apiKey}` } }
      );

      if (!kakaoRes.ok) {
        const errorText = await kakaoRes.text();
        return res.status(kakaoRes.status).json({
          ok: false,
          status: kakaoRes.status,
          error: `카카오 API 호출 오류 (${kakaoRes.status})`,
          rawResponse: errorText,
          advice: '카카오 Developers에서 REST API 키와 허용 IP 설정을 확인해주세요.',
        });
      }

      const data = await kakaoRes.json();
      const doc = data.documents?.[0];
      if (!doc) {
        return res.json({
          ok: true,
          query: addressQuery,
          matchedAddress: null,
          zipCode: null,
          message: '카카오 API는 정상이나 해당 주소 검색 결과가 없습니다.',
        });
      }

      return res.json({
        ok: true,
        query: addressQuery,
        matchedAddress: doc.address_name,
        zipCode: doc.road_address?.zone_no || doc.address?.zip_code || null,
        details: doc,
      });
    } catch (e: any) {
      console.error('Kakao diagnostic error:', e);
      return res.status(500).json({
        ok: false,
        error: `서버 내부 또는 네트워크 오류: ${e.message}`,
      });
    }
  });

  app.post(
    '/api/extract',
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          return res.status(400).json({ error: `파일 업로드 오류: ${err.message}` });
        }
        if (err) {
          return res.status(500).json({ error: `서버 내부 오류: ${err.message}` });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const jsonData = await callMimoVision(ai, req.file);
        validateExtractedDataQuality(jsonData, req.file.originalname);

        const zipCode = await findZipCode(jsonData.Address_Detail_1).catch((err) => {
          console.error('Kakao zip lookup failed:', err);
          return null;
        });

        if (zipCode) jsonData.Zip_Code = zipCode;
        return res.json(jsonData);
      } catch (error: any) {
        console.error('Extraction error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
      }
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`OCR model: ${OCR_MODEL}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});
