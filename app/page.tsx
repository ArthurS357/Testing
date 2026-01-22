'use client';

import { useState, useRef, useCallback } from 'react';

// --- Interfaces da API (Compatível com v7.2+) ---
interface BlobFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: string;
}

interface ApiMeta {
  page_size_bytes: number;
  count: number;
  timestamp: string;
}

interface ApiResponse {
  blobs: BlobFile[];
  cursor?: string;
  hasMore: boolean;
  meta: ApiMeta;
}

export default function AuditPage() {
  const inputFileRef = useRef<HTMLInputElement>(null);

  // Estados Globais
  const [token, setToken] = useState('');
  const [status, setStatus] = useState({ msg: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(''); // Barra de progresso textual
  const [isDragging, setIsDragging] = useState(false);

  // Estados de Dados (Paginação e Busca v7.2)
  const [files, setFiles] = useState<BlobFile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState({ totalShownBytes: 0, count: 0 });
  const [searchPrefix, setSearchPrefix] = useState('');

  // Estados Stealth v8.0
  const [stealthMode, setStealthMode] = useState(false);
  const [useCompression, setUseCompression] = useState(true);

  // Preview & Decoder
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [decoderCmd, setDecoderCmd] = useState<string | null>(null);

  const showStatus = (msg: string, type: string) => {
    setStatus({ msg, type });
    // Limpa msg após 4s, exceto se for erro persistente
    setTimeout(() => setStatus(prev => prev.msg === msg ? { msg: '', type: '' } : prev), 4000);
  };

  // --- BUSCA (API v7.2 - Mantida) ---
  const fetchFiles = async (isLoadMore = false) => {
    if (!token) {
      if (!isLoadMore) showStatus('Insira o Token primeiro.', 'error');
      return;
    }

    try {
      if (!isLoadMore) setLoading(true);

      const params = new URLSearchParams();
      params.set('limit', '50');
      if (searchPrefix) params.set('prefix', searchPrefix);
      if (isLoadMore && nextCursor) params.set('cursor', nextCursor);

      const res = await fetch(`/api/files?${params.toString()}`, {
        headers: { 'x-audit-token': token }
      });

      if (res.ok) {
        const data: ApiResponse = await res.json();
        if (isLoadMore) {
          setFiles(prev => [...prev, ...data.blobs]);
        } else {
          setFiles(data.blobs);
        }
        setNextCursor(data.cursor || null);
        setHasMore(data.hasMore);
        setStats(prev => ({
          count: isLoadMore ? prev.count + data.meta.count : data.meta.count,
          totalShownBytes: isLoadMore ? prev.totalShownBytes + data.meta.page_size_bytes : data.meta.page_size_bytes
        }));
      } else {
        if (res.status === 401) showStatus('Token Inválido', 'error');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFiles(false);
  };

  // --- Funções Auxiliares Stealth ---
  const compressFile = async (file: File | Blob): Promise<Uint8Array> => {
    const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(stream).arrayBuffer().then(buffer => new Uint8Array(buffer));
  };

  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

  const xorEncrypt = (text: string, key: string) => {
    let result = "";
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  };

  const stringToHex = (str: string) => {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
      hex += str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  };

  // --- UPLOAD PROCESS (Stealth v8.0 - Fragmentação) ---
  const handleUploadProcess = async (file: File) => {
    if (!token) { showStatus('Token necessário.', 'error'); return; }
    setLoading(true);
    setProgress('Iniciando...');

    try {
      const CHUNK_SIZE = 1024 * 1024 * 3; // 3MB chunks

      if (stealthMode) {
        let fileDataToProcess: Uint8Array | string;

        if (useCompression) {
          setProgress('Comprimindo...');
          fileDataToProcess = await compressFile(file);
        } else {
          const b64 = await blobToBase64(file);
          fileDataToProcess = b64.includes(',') ? b64.split(',')[1] : b64;
        }

        let binaryString = '';
        if (fileDataToProcess instanceof Uint8Array) {
          for (let i = 0; i < fileDataToProcess.byteLength; i++) {
            binaryString += String.fromCharCode(fileDataToProcess[i]);
          }
        } else {
          binaryString = atob(fileDataToProcess as string);
        }

        const totalSize = binaryString.length;
        const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

        showStatus(`Modo Fragmentado: ${totalChunks} partes`, 'info');

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, totalSize);
          const chunkBinary = binaryString.substring(start, end);
          const chunkBase64 = btoa(chunkBinary);

          const partNumber = (i + 1).toString().padStart(3, '0');
          const partName = totalChunks > 1 ? `${file.name}.part${partNumber}` : file.name;

          setProgress(`Enviando parte ${i + 1}/${totalChunks}...`);

          const hiddenPayload = `${partName}::${chunkBase64}`;
          const encryptedBinary = xorEncrypt(hiddenPayload, token);
          const memoryDump = stringToHex(encryptedBinary);

          const crashReport = {
            type: "system_crash_fragment",
            part: i + 1,
            total_parts: totalChunks,
            timestamp: Date.now(),
            memory_dump: memoryDump
          };

          const logId = Math.floor(Math.random() * 900000) + 100000;

          const res = await fetch(`/api/upload?mode=stealth&log_id=${logId}_p${partNumber}`, {
            method: 'POST',
            headers: { 'x-audit-token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify(crashReport)
          });

          if (!res.ok) throw new Error(`Falha na parte ${i + 1}`);
          await new Promise(r => setTimeout(r, 200));
        }

      } else {
        const res = await fetch(`/api/upload?filename=${file.name}`, {
          method: 'POST', body: file, headers: { 'x-audit-token': token }
        });
        if (!res.ok) throw new Error('Falha no upload');
      }

      showStatus('Sucesso! Upload concluído.', 'success');
      if (inputFileRef.current) inputFileRef.current.value = "";
      setProgress('');
      await fetchFiles(false);

    } catch (e: any) {
      showStatus(`Erro: ${e.message}`, 'error');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  // --- DOWNLOAD STEALTH ---
  const handleStealthDownload = async (file: BlobFile) => {
    if (!token) { showStatus('Token necessário.', 'error'); return; }
    showStatus('Baixando via Proxy...', 'info');

    try {
      const res = await fetch(`/api/upload?url=${encodeURIComponent(file.url)}`, {
        method: 'GET', headers: { 'x-audit-token': token }
      });

      if (!res.ok) throw new Error('Falha no proxy');

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const saveName = file.pathname.includes('.part') ? `system_log_${file.pathname}` : `system_error_${Date.now()}.log`;
      link.setAttribute('download', saveName);
      document.body.appendChild(link);
      link.click();
      link.remove();

      showStatus('Baixado. Use o comando abaixo.', 'success');

      const cmd = `python3 -c "import sys, re; key='${token}';
files = sorted(sys.argv[1:]); 
full_hex = '';
for f in files:
    try:
        c = open(f).read();
        full_hex += c.split('START\\n')[1].split('\\nMEMORY')[0].strip()
    except: pass;
b = bytes.fromhex(full_hex);
o = bytes([b[i]^ord(key[i%len(key)]) for i in range(len(b))]);
fname = 'RESTORED_' + files[0].replace('system_log_','').split('.part')[0];
open(fname,'wb').write(o);
print(f'Sucesso! Salvo como {fname}')" *.log`;

      setDecoderCmd(cmd);
    } catch (e) {
      showStatus('Erro no download.', 'error');
    }
  };

  // --- DOWNLOAD NORMAL (NOVO) ---
  const handleNormalDownload = (file: BlobFile) => {
    const link = document.createElement('a');
    link.href = file.url;
    link.setAttribute('download', file.pathname);
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handlers UI
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files[0]) handleUploadProcess(e.dataTransfer.files[0]);
  }, [token, stealthMode, useCompression]);

  const handleDelete = async (url: string) => {
    if (!confirm('Deletar?')) return;
    try {
      await fetch(`/api/upload?url=${url}`, { method: 'DELETE', headers: { 'x-audit-token': token } });
      setFiles(files.filter(f => f.url !== url));
      showStatus('Deletado', 'success');
    } catch (e) { showStatus('Erro ao deletar', 'error'); }
  };

  const handlePreview = async (file: BlobFile) => {
    if (!file.pathname.match(/\.(txt|csv|log|json|md|py|js|ts|tsx|java|c|cpp|sql|sh|xml|yaml|yml|ini|env)$/i)) {
      window.open(file.url, '_blank');
      return;
    }
    try {
      const res = await fetch(file.url);
      setPreviewTitle(file.pathname);
      setPreviewContent(await res.text());
    } catch (e) { showStatus('Erro ao ler', 'error'); }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // --- RESTAURAÇÃO: Ícones Inteligentes Coloridos ---
  const getFileIconClass = (pathname: string) => {
    if (pathname.includes('.part')) return 'bg-purple-900 text-purple-200';
    if (pathname.match(/\.(csv|xlsx|xls)$/i)) return 'bg-green-900 text-green-200';
    if (pathname.match(/\.(pdf)$/i)) return 'bg-red-900 text-red-200';
    if (pathname.match(/\.(py|js|ts|java|c|cpp|sql|sh|xml|yaml|yml|json)$/i)) return 'bg-yellow-900 text-yellow-200';
    return 'bg-blue-900 text-blue-200';
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-300 font-sans p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-center mb-6 border-b border-gray-800 pb-4 gap-4">
          <h1 className="text-2xl font-bold text-red-500">Audit System <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">v8.1 Final</span></h1>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token (Chave Mestra)" className="bg-gray-900 border border-gray-700 text-white px-3 py-1 rounded text-sm w-48 focus:border-red-500 outline-none" />
        </header>

        {status.msg && <div className={`fixed top-4 right-4 px-6 py-3 rounded text-white font-bold z-50 ${status.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{status.msg}</div>}

        {/* Decoder Panel */}
        {decoderCmd && (
          <div className="mb-6 bg-gray-900 border border-yellow-600/50 p-4 rounded-lg shadow-lg">
            <button onClick={() => setDecoderCmd(null)} className="absolute top-2 right-2 text-gray-500 hover:text-white">&times;</button>
            <h3 className="text-yellow-500 font-bold mb-2">⚠️ Decodificador Universal (v8.0)</h3>
            <p className="text-sm text-gray-400 mb-2">Este comando junta automaticamente arquivos fragmentados:</p>
            <div className="bg-black p-3 rounded border border-gray-700 font-mono text-xs text-green-400 break-all select-all cursor-pointer" onClick={() => navigator.clipboard.writeText(decoderCmd)}>
              {decoderCmd}
            </div>
            <p className="text-[10px] text-gray-500 mt-2 text-center uppercase">Clique no código para copiar</p>
          </div>
        )}

        {/* Stealth Controls */}
        <div className={`mb-6 p-4 rounded border flex flex-col gap-4 transition-colors ${stealthMode ? 'bg-red-900/10 border-red-600' : 'bg-gray-900 border-gray-700'}`}>
          <div className="flex items-center gap-3">
            <input id="stealth-mode" type="checkbox" checked={stealthMode} onChange={(e) => setStealthMode(e.target.checked)} className="w-5 h-5 accent-red-600 cursor-pointer" />
            <label htmlFor="stealth-mode" className={`font-bold text-lg cursor-pointer ${stealthMode ? 'text-red-400' : 'text-white'}`}>{stealthMode ? '👻 MODO GHOST (Fragmentado)' : '🔓 Modo Padrão'}</label>
          </div>
          {stealthMode && <div className="pl-8 text-sm text-gray-400">Arquivos grandes serão divididos em logs de 3MB.</div>}
        </div>

        {/* Upload Zone */}
        <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer mb-8 ${isDragging ? 'border-red-500 bg-red-900/20' : 'border-gray-700 bg-gray-900/30'}`}>
          <input type="file" ref={inputFileRef} onChange={(e) => e.target.files && handleUploadProcess(e.target.files[0])} className="hidden" id="fileUpload" />
          <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center">
            <span className="text-lg font-medium text-gray-300">{loading ? `Processando... ${progress}` : 'Arraste arquivos aqui'}</span>
          </label>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center mb-4 gap-4 bg-gray-900 p-3 rounded border border-gray-800">
          <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto flex-1 max-w-md">
            <input type="text" value={searchPrefix} onChange={(e) => setSearchPrefix(e.target.value)} placeholder="Filtrar..." className="bg-gray-950 border border-gray-700 text-white px-3 py-1.5 rounded text-sm w-full outline-none" />
            <button type="submit" className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm">🔍</button>
          </form>
          <button onClick={() => fetchFiles(false)} className="text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded border border-gray-700">↻ Recarregar</button>
        </div>

        {/* File List */}
        {files.length > 0 && <div className="text-xs text-gray-500 mb-2 text-right">Exibindo {files.length} • {formatBytes(stats.totalShownBytes)}</div>}

        <div className="space-y-3">
          {files.map((file) => (
            <div key={file.url} className="group flex items-center justify-between bg-gray-900 p-3 rounded-lg border border-gray-800 hover:border-red-900/50">
              <div className="flex items-center gap-3 overflow-hidden">
                {/* Ícone Colorido Restaurado */}
                <div className={`w-10 h-10 rounded flex items-center justify-center font-bold text-[10px] shrink-0 ${getFileIconClass(file.pathname)}`}>
                  {file.pathname.includes('part') ? 'PART' : file.pathname.split('.').pop()?.substring(0, 4).toUpperCase()}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium text-gray-200 truncate cursor-pointer hover:text-red-400" onClick={() => handlePreview(file)}>{file.pathname}</span>
                  <span className="text-[10px] text-gray-500">{formatBytes(file.size)} • {new Date(file.uploadedAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-100 sm:opacity-40 group-hover:opacity-100 transition-opacity">
                {/* Botões Novos */}
                <button onClick={() => handlePreview(file)} className="p-2 hover:bg-blue-900/30 rounded text-blue-400" title="Visualizar">👁️</button>
                <button onClick={() => handleNormalDownload(file)} className="p-2 hover:bg-green-900/30 rounded text-green-400" title="Download Normal">⬇️</button>

                {/* Botões Antigos */}
                <button onClick={() => handleStealthDownload(file)} className="p-2 hover:bg-yellow-900/30 rounded text-yellow-500" title="Baixar Stealth">🛡️</button>
                <button onClick={() => handleDelete(file.url)} className="p-2 hover:bg-red-900/30 rounded text-red-400" title="Apagar">🗑️</button>
              </div>
            </div>
          ))}
          {hasMore && <button onClick={() => fetchFiles(true)} disabled={loading} className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded border border-gray-700 mt-4">⬇️ Carregar Mais</button>}
        </div>
      </div>
      {previewContent && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 w-full max-w-3xl rounded-lg flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-800"><h3 className="font-bold text-red-400 truncate">{previewTitle}</h3><button onClick={() => setPreviewContent(null)} className="text-gray-400 text-2xl">&times;</button></div>
            <pre className="p-4 font-mono text-xs text-gray-300 overflow-auto">{previewContent}</pre>
          </div>
        </div>
      )}
    </main>
  );
}