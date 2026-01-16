import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<NextResponse> {
  // Autenticação
  const token = request.headers.get('x-audit-token');
  if (token !== 'audit-secret') {
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  const { blobs } = await list();
  return NextResponse.json(blobs);
}