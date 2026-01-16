'use client';

import { useState, useRef, useEffect } from 'react';

// Tipo para os arquivos listados
interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
}

export default function AuditPage() {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [files, setFiles] = useState<BlobFile[]>([]);
  const [status, setStatus] = useState('');

  // Busca os arquivos ao carregar (se tiver token) ou manualmente
  const fetchFiles = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/files', {
        headers: { 'x-audit-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (error) {
      console.error("Erro ao listar", error);
    }
  };

  const uploadFile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputFileRef.current?.files?.length) {
      setStatus('Selecione um arquivo.');
      return;
    }
    
    if (!token) {
      setStatus('Insira o Token de Auditoria.');
      return;
    }

    setLoading(true);
    setStatus('Iniciando upload...');
    
    const file = inputFileRef.current.files[0];

    try {
      const response = await fetch(
        `/api/upload?filename=${file.name}`,
        {
          method: 'POST',
          body: file,
          headers: {
            'x-audit-token': token
          }
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Falha no upload');
      }

      setStatus('Upload Sucesso! Atualizando lista...');
      inputFileRef.current.value = ""; // Limpa o input
      await fetchFiles(); // Atualiza a lista
    } catch (e: any) {
      setStatus(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-green-500 font-mono p-8">
      <h1 className="text-3xl font-bold mb-6 border-b border-green-700 pb-2">
        Audit System v2.0
      </h1>

      {/* Área de Autenticação */}
      <div className="mb-6 p-4 border border-green-800 rounded">
        <label className="block text-sm mb-2">Token de Acesso:</label>
        <input 
          type="password" 
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Digite a senha (ex: audit-secret)"
          className="bg-gray-900 border border-green-700 text-white p-2 w-full rounded focus:outline-none focus:border-green-400"
        />
        <button 
          onClick={fetchFiles}
          className="mt-2 text-xs underline hover:text-green-300"
        >
          Carregar Arquivos Existentes
        </button>
      </div>

      {/* Área de Upload */}
      <form onSubmit={uploadFile} className="mb-8 p-4 border border-green-800 rounded bg-gray-900/50">
        <input 
          name="file" 
          ref={inputFileRef} 
          type="file" 
          className="block w-full text-sm text-gray-400
            file:mr-4 file:py-2 file:px-4
            file:rounded-none file:border-0
            file:text-sm file:font-semibold
            file:bg-green-900 file:text-green-300
            hover:file:bg-green-800 cursor-pointer"
        />
        
        <div className="flex items-center gap-4 mt-4">
          <button 
            type="submit" 
            disabled={loading}
            className="bg-green-700 hover:bg-green-600 text-black font-bold py-2 px-6 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Transmitindo...' : 'Executar Upload'}
          </button>
          
          {status && <span className="text-sm animate-pulse">{status}</span>}
        </div>
        
        {/* Barra de Progresso Falsa (UX) */}
        {loading && (
          <div className="w-full bg-gray-700 h-1 mt-4">
            <div className="bg-green-500 h-1 w-2/3 animate-[pulse_1s_infinite]"></div>
          </div>
        )}
      </form>

      {/* Lista de Arquivos (Download) */}
      {files.length > 0 && (
        <div className="border border-green-800 rounded p-4">
          <h2 className="text-xl font-bold mb-4">Arquivos Auditados ({files.length})</h2>
          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.url} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-900 p-3 rounded border border-gray-800 hover:border-green-700 transition-colors">
                <div className="truncate max-w-md">
                  <span className="text-white block">{file.pathname}</span>
                  <span className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB | {new Date(file.uploadedAt).toLocaleString()}</span>
                </div>
                <div className="flex gap-3 mt-2 sm:mt-0">
                  <button 
                    onClick={() => navigator.clipboard.writeText(file.url)}
                    className="text-xs border border-green-900 px-2 py-1 hover:bg-green-900 rounded"
                  >
                    Copiar Link
                  </button>
                  <a 
                    href={file.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs bg-green-900 text-green-100 px-3 py-1 hover:bg-green-800 rounded"
                  >
                    Baixar
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}