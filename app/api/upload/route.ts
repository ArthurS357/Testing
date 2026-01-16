import { put, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const SECRET = process.env.AUDIT_SECRET;

  if (!SECRET) {
    return NextResponse.json({ error: 'Erro de configuração no servidor' }, { status: 500 });
  }

  const token = request.headers.get('x-audit-token');
  
  if (token !== SECRET) {
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  if (!filename || !request.body) {
    return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });
  }

  // LISTA ATUALIZADA: Adicionadas extensões de código e desenvolvimento
  const allowedExtensions = [
    // Documentos e Imagens
    '.txt', '.docx', '.png', '.jpg', '.jpeg', '.log', '.csv', '.xlsx', '.xls', '.pdf', '.json',
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
    '.html', '.css', '.xml', '.yaml', '.yml' // Web & Config
  ];

  const isAllowed = allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  
  if (!isAllowed) {
    return NextResponse.json({ 
      error: `Extensão bloqueada. Permitidos: ${allowedExtensions.join(', ')}` 
    }, { status: 403 });
  }

  const blob = await put(filename, request.body, { access: 'public' });

  return NextResponse.json(blob);
}

// Atualize também o DELETE seguindo a mesma lógica
export async function DELETE(request: Request): Promise<NextResponse> {
  const SECRET = process.env.AUDIT_SECRET;
  const token = request.headers.get('x-audit-token');

  if (!SECRET || token !== SECRET) {
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const urlToDelete = searchParams.get('url');

  if (!urlToDelete) {
    return NextResponse.json({ error: 'URL necessária' }, { status: 400 });
  }

  await del(urlToDelete);
  return NextResponse.json({ success: true });
}