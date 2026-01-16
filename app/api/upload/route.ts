import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');
  
  // 1. Autenticação Simples
  const token = request.headers.get('x-audit-token');
  if (token !== 'audit-secret') {
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  if (!filename || !request.body) {
    return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });
  }

  // 2. Validação de Extensão ATUALIZADA
  // Adicionei .csv, .xlsx, .xls e .pdf à lista
  const allowedExtensions = ['.txt', '.docx', '.png', '.log', '.csv', '.xlsx', '.xls', '.pdf'];
  
  const isAllowed = allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  
  if (!isAllowed) {
    return NextResponse.json({ 
      error: `Extensão bloqueada para teste. Permitidos: ${allowedExtensions.join(', ')}` 
    }, { status: 403 });
  }

  const blob = await put(filename, request.body, { access: 'public' });

  return NextResponse.json(blob);
}