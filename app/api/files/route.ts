import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<NextResponse> {
  const SECRET = process.env.AUDIT_SECRET;
  const token = request.headers.get('x-audit-token');

  // Validação segura
  if (!SECRET || token !== SECRET) {
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  const { blobs } = await list();
  return NextResponse.json(blobs);
}