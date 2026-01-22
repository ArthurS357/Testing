import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Força a rota a ser dinâmica (sem cache estático), essencial para ver uploads recentes
export const dynamic = 'force-dynamic';

// Função de comparação segura contra Timing Attacks
const safeCompare = (a: string, b: string) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Se tamanhos diferentes, já falha (mas de forma segura seria ideal padronizar, 
  // aqui simplificamos para evitar erros de buffer)
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

export async function GET(request: Request): Promise<NextResponse> {
  const SECRET = process.env.AUDIT_SECRET;
  const token = request.headers.get('x-audit-token');

  // 1. Segurança: Validação Robusta
  if (!SECRET || !token || !safeCompare(token, SECRET)) {
    // Retorna 401 com um atraso artificial aleatório para confundir scanners
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    return NextResponse.json({ error: 'Acesso Negado' }, { status: 401 });
  }

  // 2. Captura de Parâmetros de Busca (Paginação e Filtros)
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get('cursor') || undefined;
  const limit = parseInt(searchParams.get('limit') || '50'); // Padrão: 50 arquivos por vez
  const prefix = searchParams.get('prefix') || ''; // Filtrar por pasta (ex: "logs/")

  try {
    // 3. Busca Otimizada no Vercel Blob
    const response = await list({
      cursor,
      limit,
      prefix,
      mode: 'expanded', // Traz metadados extras se disponíveis
    });

    // 4. Feature Nova: Cálculo de Estatísticas da Página (Analytics Rápido)
    // Calcula o tamanho total dos arquivos retornados nesta página
    const pageTotalSize = response.blobs.reduce((acc, blob) => acc + blob.size, 0);

    return NextResponse.json({
      ...response, // Retorna blobs, cursor e hasMore
      meta: {
        page_size_bytes: pageTotalSize,
        count: response.blobs.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Blob List Error:', error);
    return NextResponse.json({ error: 'Falha ao listar arquivos' }, { status: 500 });
  }
}