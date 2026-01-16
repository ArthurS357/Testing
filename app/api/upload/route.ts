import { put, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

// Função para validar token
const isValidToken = (req: Request) => req.headers.get('x-audit-token') === 'audit-secret';

export async function POST(request: Request): Promise<NextResponse> {
  if (!isValidToken(request)) {
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  if (!filename || !request.body) {
    return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });
  }

  // Lista de extensões permitidas expandida
  const allowedExtensions = ['.txt', '.docx', '.png', '.jpg', '.jpeg', '.log', '.csv', '.xlsx', '.xls', '.pdf', '.json'];
  const isAllowed = allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  
  if (!isAllowed) {
    return NextResponse.json({ error: 'Extensão bloqueada.' }, { status: 403 });
  }

  const blob = await put(filename, request.body, { access: 'public' });
  return NextResponse.json(blob);
}

// Nova rota DELETE para apagar arquivos
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isValidToken(request)) {
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