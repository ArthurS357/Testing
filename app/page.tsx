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

  // --- CORREÇÃO: Estado de Drag & Drop (Adicionado) ---
  const [isDragging, setIsDragging] = useState(false);

  // Estados de Auditoria (Stealth v6)
  const [stealthMode, setStealthMode] = useState(false);
  const [useCompression, setUseCompression] = useState(true); // NOVO: Compressão Gzip
  const [fakeExt, setFakeExt] = useState('.txt'); // NOVO: Extensão Falsa para URL

  // Estado para Preview
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  const showStatus = (msg: string, type: string) => {
    setStatus({ msg, type });
    setTimeout(() => setStatus({ msg: '', type: '' }), 4000);
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

  // --- Função 1: Compressão Gzip (Nativa do Navegador - v6.0) ---
  const compressFile = async (file: File): Promise<Uint8Array> => {
    // Cria um stream de compressão gzip direto no browser
    const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(stream).arrayBuffer().then(buffer => new Uint8Array(buffer));
  };

  // --- Função 2: Converter Buffer (Binário) para Base64 ---
  const bufferToBase64 = (buffer: Uint8Array): string => {
    let binary = '';
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  };

  // --- Função 3: Converter Arquivo Normal para Base64 (Fallback) ---
  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

  // --- Função 4: Criptografia XOR Simples ---
  // Quebra a assinatura do arquivo (Magic Bytes)
  const xorEncrypt = (text: string, key: string = "audit-key") => {
    let result = "";
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result);
  };

  // Processo de Upload (Atualizado para v6.0)
  const handleUploadProcess = async (file: File) => {
    if (!token) {
      showStatus('Insira o Token de Auditoria.', 'error');
      return;
    }
    setLoading(true);

    const msg = stealthMode
      ? `Stealth v6 (Gzip: ${useCompression ? 'ON' : 'OFF'})...`
      : 'Enviando normal...';
    showStatus(msg, 'info');

    try {
      let response;

      if (stealthMode) {
        // >>> MODO STEALTH v6 (Compressão + XOR + Spoofing) <<<

        let contentToEncrypt = '';

        if (useCompression) {
          // 1. Comprime o arquivo (reduz tamanho significativamente)
          const compressedBytes = await compressFile(file);
          // 2. Converte para Base64 puro
          contentToEncrypt = bufferToBase64(compressedBytes);
        } else {
          // Sem compressão (Base64 padrão com header data:...)
          contentToEncrypt = await fileToBase64(file);
        }

        // 3. Encripta o conteúdo (XOR)
        const encryptedContent = xorEncrypt(contentToEncrypt);

        // 4. Spoofing de URL: Gera um nome falso com a extensão escolhida
        // O Firewall vai achar que é um .png ou .css
        const fakeName = `resource_id_${Date.now()}${fakeExt}`;

        // 5. Payload Camuflado
        const mimicPayload = {
          eventType: "system_crash_report",
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          compression: useCompression, // Avisa o back para descomprimir
          payload: encryptedContent,
          realName: file.name // O nome verdadeiro vai escondido aqui
        };

        response = await fetch(`/api/upload?filename=${fakeName}&mode=stealth`, {
          method: 'POST',
          headers: {
            'x-audit-token': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(mimicPayload)
        });

      } else {
        // >>> MODO PADRÃO (Teste de Extensão) <<<
        response = await fetch(`/api/upload?filename=${file.name}`, {
          method: 'POST',
          body: file,
          headers: { 'x-audit-token': token }
        });
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Falha');
      }

      showStatus('Sucesso! Arquivo salvo.', 'success');
      if (inputFileRef.current) inputFileRef.current.value = "";
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
  }, [token, stealthMode, useCompression, fakeExt]); // Dependências atualizadas

  // Função de Deletar
  const handleDelete = async (url: string) => {
    if (!confirm('Tem certeza que deseja apagar este arquivo da nuvem?')) return;
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

  // Função de Preview
  const handlePreview = async (file: BlobFile) => {
    // Regex expandido para incluir códigos fonte e configurações
    if (!file.pathname.match(/\.(txt|csv|log|json|md|py|js|ts|tsx|java|c|cpp|sql|sh|xml|yaml|yml|ini|env)$/i)) {
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
        <header className="flex flex-col md:flex-row justify-between items-center mb-6 border-b border-gray-800 pb-4 gap-4">
          <h1 className="text-2xl font-bold text-green-500">Audit System <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">v6.0 Gzip+Spoof</span></h1>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token (audit-secret)"
            className="bg-gray-900 border border-gray-700 text-white px-3 py-1 rounded text-sm w-48 focus:border-green-500 outline-none transition-all"
          />
        </header>

        {/* Status Toast */}
        {status.msg && (
          <div className={`fixed top-4 right-4 px-6 py-3 rounded shadow-xl text-white font-bold animate-bounce z-50 ${status.type === 'error' ? 'bg-red-600' : status.type === 'success' ? 'bg-green-600' : 'bg-blue-600'
            }`}>
            {status.msg}
          </div>
        )}

        {/* --- PAINEL DE CONTROLE STEALTH --- */}
        <div className={`mb-6 p-4 rounded border flex flex-col gap-4 transition-colors
          ${stealthMode ? 'bg-green-900/20 border-green-600' : 'bg-gray-900 border-gray-700'}`}>

          <div className="flex items-center gap-3">
            <input
              id="stealth-mode"
              type="checkbox"
              checked={stealthMode}
              onChange={(e) => setStealthMode(e.target.checked)}
              className="w-5 h-5 text-green-600 bg-gray-700 border-gray-500 rounded cursor-pointer"
            />
            <label htmlFor="stealth-mode" className={`font-bold text-lg cursor-pointer ${stealthMode ? 'text-green-400' : 'text-white'}`}>
              {stealthMode ? '🔒 MODO STEALTH ATIVADO' : '🔓 Modo Padrão'}
            </label>
          </div>

          {stealthMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-8 border-t border-gray-700/50 pt-4">
              {/* Opção de Compressão */}
              <div className="flex items-center gap-2">
                <input
                  id="compression"
                  type="checkbox"
                  checked={useCompression}
                  onChange={(e) => setUseCompression(e.target.checked)}
                  className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-500 rounded"
                />
                <label htmlFor="compression" className="text-sm cursor-pointer hover:text-white select-none">
                  Ativar Compressão Gzip (Reduz tamanho)
                </label>
              </div>

              {/* Seletor de Extensão Falsa */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Disfarçar URL como:</label>
                <select
                  value={fakeExt}
                  onChange={(e) => setFakeExt(e.target.value)}
                  className="bg-gray-800 border border-gray-600 text-white text-xs rounded px-2 py-1 outline-none focus:border-green-500"
                >
                  <option value=".txt">Log de Texto (.txt)</option>
                  <option value=".png">Imagem PNG (.png)</option>
                  <option value=".jpg">Imagem JPG (.jpg)</option>
                  <option value=".css">Estilo CSS (.css)</option>
                  <option value=".js">Script JS (.js)</option>
                  <option value=".dat">Dados Binários (.dat)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Upload Area (Drag & Drop) */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer mb-8 relative overflow-hidden
            ${isDragging ? 'border-green-500 bg-green-900/20 scale-[1.02]' : 'border-gray-700 hover:border-gray-500 bg-gray-900/30'}
            ${stealthMode && !isDragging ? 'border-green-800/50' : ''}`}
        >
          <input
            type="file"
            ref={inputFileRef}
            onChange={(e) => e.target.files && handleUploadProcess(e.target.files[0])}
            className="hidden"
            id="fileUpload"
          />
          <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center relative z-10">
            <svg className={`w-12 h-12 mb-3 transition-colors ${stealthMode ? 'text-green-500' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
            <span className="text-lg font-medium text-gray-300">
              {loading ? 'Processando...' : 'Arraste arquivos ou clique para selecionar'}
            </span>
            <span className="text-xs text-gray-500 mt-2">
              Suporta todos os formatos (Docs, Imagens, Códigos, Binários)
            </span>
          </label>
        </div>

        {/* Lista de Arquivos */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-200">Arquivos na Nuvem</h2>
          <button onClick={fetchFiles} className="text-xs sm:text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded border border-gray-700 transition-colors">
            ↻ Atualizar Lista
          </button>
        </div>

        <div className="space-y-3">
          {files.map((file) => (
            <div key={file.url} className="group flex items-center justify-between bg-gray-900 p-3 rounded-lg border border-gray-800 hover:border-green-900/50 transition-all">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-10 h-10 rounded flex items-center justify-center font-bold text-[10px] shrink-0
                  ${file.pathname.endsWith('.csv') || file.pathname.endsWith('.xlsx') ? 'bg-green-900 text-green-200' :
                    file.pathname.endsWith('.pdf') ? 'bg-red-900 text-red-200' :
                      file.pathname.match(/\.(py|js|ts|java|c|cpp|sql)$/i) ? 'bg-yellow-900 text-yellow-200' :
                        'bg-blue-900 text-blue-200'}`}>
                  {file.pathname.split('.').pop()?.toUpperCase().substring(0, 4)}
                </div>

                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium text-gray-200 truncate max-w-[150px] sm:max-w-md cursor-pointer hover:text-green-400 transition-colors" onClick={() => handlePreview(file)}>
                    {file.pathname}
                  </span>
                  <span className="text-[10px] text-gray-500">{(file.size / 1024).toFixed(1)} KB • {new Date(file.uploadedAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-100 sm:opacity-40 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handlePreview(file)}
                  className="p-2 hover:bg-gray-700 rounded text-blue-400 transition-colors"
                  title="Visualizar Conteúdo"
                >
                  👁️
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(file.url); showStatus('Link copiado!', 'success'); }}
                  className="p-2 hover:bg-gray-700 rounded text-gray-400 transition-colors"
                  title="Copiar Link"
                >
                  📋
                </button>
                <button
                  onClick={() => handleDelete(file.url)}
                  className="p-2 hover:bg-red-900/30 rounded text-red-400 transition-colors"
                  title="Deletar permanentemente"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
          {files.length === 0 && <p className="text-gray-600 text-center py-8 border border-dashed border-gray-800 rounded">Nenhum arquivo encontrado. Use o Token para carregar a lista.</p>}
        </div>
      </div>

      {/* Modal de Preview */}
      {previewContent && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 w-full max-w-3xl rounded-lg shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-900 rounded-t-lg">
              <h3 className="font-bold text-green-400 truncate pr-4">{previewTitle}</h3>
              <button onClick={() => setPreviewContent(null)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            <div className="p-0 overflow-auto bg-gray-950">
              <pre className="p-4 font-mono text-xs sm:text-sm text-gray-300 whitespace-pre-wrap break-all">
                {previewContent}
              </pre>
            </div>
            <div className="p-4 border-t border-gray-800 flex justify-end bg-gray-900 rounded-b-lg">
              <button onClick={() => setPreviewContent(null)} className="bg-gray-800 px-6 py-2 rounded text-sm hover:bg-gray-700 border border-gray-700 transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}