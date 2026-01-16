import { put, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Carrega a senha das variáveis de ambiente
  const SECRET = process.env.AUDIT_SECRET;

  // Segurança extra: Se a variável não estiver configurada no servidor, bloqueia tudo.
  if (!SECRET) {
    console.error('ERRO: AUDIT_SECRET não configurado no ambiente.');
    return NextResponse.json({ error: 'Erro de configuração no servidor' }, { status: 500 });
  }

  // 2. Validação do Token
  const token = request.headers.get('x-audit-token');
  
  if (token !== SECRET) {
    return NextResponse.json({ error: 'Acesso Negado: Credenciais inválidas' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  if (!filename || !request.body) {
    return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });
  }

  // Validação de Extensão (Mantida)
  const allowedExtensions = ['.txt', '.docx', '.png', '.jpg', '.jpeg', '.log', '.csv', '.xlsx', '.xls', '.pdf', '.json'];
  const isAllowed = allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  
  if (!isAllowed) {
    return NextResponse.json({ error: 'Extensão bloqueada.' }, { status: 403 });
  }

  // O Vercel Blob lê automaticamente o BLOB_READ_WRITE_TOKEN do ambiente,
  // não precisamos passar manualmente aqui.
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