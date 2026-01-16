'use client';

import { useState, useRef, useCallback } from 'react';

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
  const [status, setStatus] = useState({ msg: '', type: '' }); // 'success' | 'error' | 'info'
  const [isDragging, setIsDragging] = useState(false);
  
  // Estado para Preview
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  const showStatus = (msg: string, type: string) => {
    setStatus({ msg, type });
    setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
  };

  const fetchFiles = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/files', { headers: { 'x-audit-token': token } });
      if (res.ok) {
        setFiles(await res.json());
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Processo de Upload (Reutilizável)
  const handleUploadProcess = async (file: File) => {
    if (!token) {
      showStatus('Insira o Token de Auditoria.', 'error');
      return;
    }
    setLoading(true);
    showStatus('Enviando...', 'info');

    try {
      const response = await fetch(`/api/upload?filename=${file.name}`, {
        method: 'POST',
        body: file,
        headers: { 'x-audit-token': token }
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Falha');
      }

      showStatus('Upload concluído!', 'success');
      if(inputFileRef.current) inputFileRef.current.value = "";
      await fetchFiles();
    } catch (e: any) {
      showStatus(`Erro: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handlers de Drag & Drop
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadProcess(e.dataTransfer.files[0]);
    }
  }, [token]);

  // Função de Deletar
  const handleDelete = async (url: string) => {
    if (!confirm('Tem certeza que deseja apagar este arquivo?')) return;
    try {
      const res = await fetch(`/api/upload?url=${url}`, {
        method: 'DELETE',
        headers: { 'x-audit-token': token }
      });
      if (res.ok) {
        showStatus('Arquivo deletado.', 'success');
        setFiles(files.filter(f => f.url !== url));
      }
    } catch (e) {
      showStatus('Erro ao deletar.', 'error');
    }
  };

  // Função de Preview (Ler conteúdo sem baixar)
  const handlePreview = async (file: BlobFile) => {
    // Apenas tenta ler arquivos de texto/csv/log
    if (!file.pathname.match(/\.(txt|csv|log|json|md)$/i)) {
      window.open(file.url, '_blank');
      return;
    }

    try {
      const res = await fetch(file.url);
      const text = await res.text();
      setPreviewTitle(file.pathname);
      setPreviewContent(text);
    } catch (e) {
      showStatus('Não foi possível ler o arquivo.', 'error');
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-300 font-sans p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
          <h1 className="text-2xl font-bold text-green-500">Audit System <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">v3.0</span></h1>
          <input 
            type="password" 
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token (audit-secret)"
            className="bg-gray-900 border border-gray-700 text-white px-3 py-1 rounded text-sm w-48 focus:border-green-500 outline-none"
          />
        </header>

        {/* Status Toast */}
        {status.msg && (
          <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg text-white font-bold animate-bounce ${
            status.type === 'error' ? 'bg-red-600' : status.type === 'success' ? 'bg-green-600' : 'bg-blue-600'
          }`}>
            {status.msg}
          </div>
        )}

        {/* Upload Area (Drag & Drop) */}
        <div 
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer mb-8
            ${isDragging ? 'border-green-500 bg-green-900/20' : 'border-gray-700 hover:border-gray-500 bg-gray-900/50'}`}
        >
          <input 
            type="file" 
            ref={inputFileRef}
            onChange={(e) => e.target.files && handleUploadProcess(e.target.files[0])}
            className="hidden" 
            id="fileUpload"
          />
          <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center">
            <svg className="w-12 h-12 text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
            <span className="text-lg font-medium text-gray-300">
              {loading ? 'Processando Upload...' : 'Arraste arquivos ou clique para selecionar'}
            </span>
            <span className="text-xs text-gray-500 mt-2">Suporta .csv, .txt, .pdf, .xlsx, imagens</span>
          </label>
        </div>

        {/* Botão para carregar lista */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Arquivos na Nuvem</h2>
          <button onClick={fetchFiles} className="text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded border border-gray-700">
            ↻ Atualizar Lista
          </button>
        </div>

        {/* Lista de Arquivos */}
        <div className="space-y-3">
          {files.map((file) => (
            <div key={file.url} className="group flex items-center justify-between bg-gray-900 p-3 rounded-lg border border-gray-800 hover:border-green-900/50 transition-all">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-10 h-10 rounded flex items-center justify-center font-bold text-xs
                  ${file.pathname.endsWith('.csv') ? 'bg-green-900 text-green-200' : 
                    file.pathname.endsWith('.pdf') ? 'bg-red-900 text-red-200' : 
                    'bg-blue-900 text-blue-200'}`}>
                  {file.pathname.split('.').pop()?.toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-200 truncate max-w-[200px] sm:max-w-md cursor-pointer hover:text-green-400" onClick={() => handlePreview(file)}>
                    {file.pathname}
                  </span>
                  <span className="text-[10px] text-gray-500">{(file.size/1024).toFixed(1)} KB • {new Date(file.uploadedAt).toLocaleTimeString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-100 sm:opacity-40 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => handlePreview(file)}
                  className="p-2 hover:bg-gray-700 rounded text-blue-400"
                  title="Visualizar/Baixar"
                >
                  👁️
                </button>
                <button 
                  onClick={() => { navigator.clipboard.writeText(file.url); showStatus('Link copiado!', 'success'); }}
                  className="p-2 hover:bg-gray-700 rounded text-gray-400"
                  title="Copiar Link"
                >
                  📋
                </button>
                <button 
                  onClick={() => handleDelete(file.url)}
                  className="p-2 hover:bg-red-900/30 rounded text-red-400"
                  title="Deletar permanentemente"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
          {files.length === 0 && <p className="text-gray-600 text-center py-8">Nenhum arquivo encontrado (Use o Token para carregar)</p>}
        </div>
      </div>

      {/* Modal de Preview */}
      {previewContent && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <h3 className="font-bold text-green-400 truncate">{previewTitle}</h3>
              <button onClick={() => setPreviewContent(null)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>
            <div className="p-4 overflow-auto font-mono text-xs text-gray-300 bg-gray-950/50 whitespace-pre-wrap">
              {previewContent}
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end">
              <button onClick={() => setPreviewContent(null)} className="bg-gray-800 px-4 py-2 rounded text-sm hover:bg-gray-700">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}