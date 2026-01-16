import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');
  
  // 1. Autenticação Simples (Header Check)
  const token = request.headers.get('x-audit-token');
  if (token !== 'audit-secret') { // Em produção, use variáveis de ambiente
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  if (!filename || !request.body) {
    return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });
  }

  // 2. Validação de Extensão (Simulando teste de filtro)
  const allowedExtensions = ['.txt', '.docx', '.png', '.log'];
  const isAllowed = allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  
  if (!isAllowed) {
    return NextResponse.json({ error: 'Extensão bloqueada para teste' }, { status: 403 });
  }

  const blob = await put(filename, request.body, { access: 'public' });

  return NextResponse.json(blob);
}