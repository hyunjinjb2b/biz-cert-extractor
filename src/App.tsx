import React, { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { 
  UploadCloud, 
  File as FileIcon, 
  CheckCircle2, 
  Copy, 
  Trash2, 
  ShieldAlert, 
  FileText, 
  AlertCircle, 
  Clock,
  Download
} from "lucide-react";

type ExtractedData = {
  Company_Code: string;
  Client_Type: string;
  Client_Code: string;
  Company_Name: string;
  Company_Name_Abbrev: string;
  Business_Number: string;
  CEO_Name: string;
  Business_Type: string;
  Business_Sector: string;
  Zip_Code: string;
  Address_Detail_1: string;
};

interface ProcessedFile {
  id: string;
  file: globalThis.File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  data?: ExtractedData;
  error?: string;
}

const MAX_CONCURRENT_UPLOADS = 1;

const fieldLables: Record<keyof ExtractedData, string> = {
  Company_Code: "회사코드",
  Client_Type: "거래처 구분",
  Client_Code: "거래처 코드",
  Company_Name: "거래처명",
  Company_Name_Abbrev: "거래처명 약칭",
  Business_Number: "사업자등록번호",
  CEO_Name: "대표자명",
  Business_Type: "업태",
  Business_Sector: "업종",
  Zip_Code: "우편번호",
  Address_Detail_1: "주소 상세1"
};

export default function App() {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [isHovering, setIsHovering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelName, setModelName] = useState("Unknown");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Kakao API Direct Test States
  const [showKakaoTest, setShowKakaoTest] = useState(false);
  const [testAddress, setTestAddress] = useState("서울 연세로 50");
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    query?: string;
    matchedAddress?: string | null;
    zipCode?: string | null;
    message?: string;
    error?: string;
    rawResponse?: string;
    advice?: string;
  } | null>(null);
  const [isTestingKakao, setIsTestingKakao] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then(res => res.json())
      .then(data => {
        if (typeof data?.model === "string" && data.model.trim()) {
          setModelName(data.model);
        }
      })
      .catch(() => {
        setModelName("Unknown");
      });
  }, []);

  const runKakaoTest = () => {
    if (!testAddress.trim()) return;
    setIsTestingKakao(true);
    setTestResult(null);

    fetch(`/api/test-kakao?address=${encodeURIComponent(testAddress.trim())}`)
      .then(async (res) => {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          return { ok: false, error: `서버 통신 오류 (상태코드: ${res.status})`, rawResponse: text };
        }
      })
      .then(data => {
        setTestResult(data);
        setIsTestingKakao(false);
      })
      .catch(err => {
        setTestResult({ ok: false, error: err.message || "네트워크 통신에 실패했습니다." });
        setIsTestingKakao(false);
      });
  };

  useEffect(() => {
    const uploadingCount = files.filter(f => f.status === 'uploading').length;
    const availableSlots = Math.max(0, MAX_CONCURRENT_UPLOADS - uploadingCount);
    const pendingFiles = files.filter(f => f.status === 'pending').slice(0, availableSlots);
    const shouldProcess = uploadingCount > 0 || pendingFiles.length > 0;

    if (isProcessing !== shouldProcess) {
      setIsProcessing(shouldProcess);
    }

    if (pendingFiles.length === 0) return;

    const pendingIds = new Set(pendingFiles.map(f => f.id));
    setFiles(prev => prev.map(f => pendingIds.has(f.id) ? { ...f, status: 'uploading' } : f));

    pendingFiles.forEach((pendingFile) => {
        const formData = new FormData();
        formData.append("file", pendingFile.file);

        fetch("/api/extract", { method: "POST", body: formData })
          .then(async (res) => {
              const text = await res.text();
              let data;
              try {
                  data = JSON.parse(text);
              } catch (e) {
                  const previewPrefix = text.substring(0, 15).toLowerCase();
                  if (previewPrefix.includes("<!doctype html>") || previewPrefix.includes("<html")) {
                      throw new Error("서버 로딩 중: 인공지능 분석기가 작동을 위해 잠시 기지개를 켜고 있습니다. 새로고침(F5)을 누르고 5초 뒤 다시 '재시도' 해보세요!");
                  }
                  if (!res.ok) {
                     throw new Error(`일시적 네트워크 혼잡 (${res.status}): 일시적으로 서버 연결이 고르지 못했습니다. 파일 옆 '재시도'를 눌러 다시 분석해 주십시오.`);
                  }
                  throw new Error(`데이터 수신 오류: 분석 도중 일시적인 수신 지연이 일어났습니다. 새로고침 후 실패한 파일의 '재시도'를 눌러주시기 바랍니다.`);
              }
              if (!res.ok) {
                 throw new Error(data?.error || "처리 중 오류가 발생했습니다.");
              }
              return data;
          })
          .then(data => {
              setFiles(prev => prev.map(f => f.id === pendingFile.id ? { ...f, status: 'success', data } : f));
          })
          .catch(err => {
              setFiles(prev => prev.map(f => f.id === pendingFile.id ? { ...f, status: 'error', error: err.message } : f));
          });
    });
  }, [files, isProcessing]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(true);
  };

  const handleDragLeave = () => {
    setIsHovering(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
       await handleFileSelection(e.dataTransfer.files);
    }
  };

  const handleFileSelection = async (selectedFiles: FileList | globalThis.File[]) => {
    setError(null);
    const newFiles: ProcessedFile[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Check for ZIP files
      if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
         try {
           const zip = new JSZip();
           const contents = await zip.loadAsync(file);
           
           for (const [filename, zipEntry] of Object.entries(contents.files)) {
             if (!zipEntry.dir && !filename.startsWith('__MACOSX/') && !filename.includes('/.')) {
                const ext = filename.split('.').pop()?.toLowerCase();
                if (['png', 'jpg', 'jpeg', 'pdf'].includes(ext || '')) {
                   const blob = await zipEntry.async("blob");
                   const extractedFile = new File([blob], filename.split('/').pop() || filename, {
                      type: ext === 'pdf' ? 'application/pdf' : `image/${ext}`
                   });
                   newFiles.push({
                     id: Math.random().toString(36).substring(7),
                     file: extractedFile,
                     status: 'pending'
                   });
                }
             }
           }
         } catch (e) {
             setError(`ZIP 파일 (${file.name}) 압축 해제 중 오류가 발생했습니다.`);
         }
      } else {
         const ext = file.name.split('.').pop()?.toLowerCase();
         if (['png', 'jpg', 'jpeg', 'pdf'].includes(ext || '')) {
            newFiles.push({
              id: Math.random().toString(36).substring(7),
              file,
              status: 'pending'
            });
         }
      }
    }

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
    } else if (!error) {
      setError("유효한 이미지나 PDF 파일을 찾을 수 없거나 ZIP 파일이 비어있습니다.");
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetAll = () => {
    setFiles([]);
    setError(null);
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };
  
  const retryFile = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'pending', error: undefined } : f));
  };
  
  const successfulFiles = files.filter(f => f.status === 'success' && f.data);

  const downloadExcel = () => {
    if (successfulFiles.length === 0) return;
    
    const worksheetData = [];
    const headers = Object.values(fieldLables);
    worksheetData.push(headers);
    
    for (const item of successfulFiles) {
      worksheetData.push([
        item.data!.Company_Code,
        item.data!.Client_Type,
        item.data!.Client_Code,
        item.data!.Company_Name,
        item.data!.Company_Name_Abbrev,
        item.data!.Business_Number,
        item.data!.CEO_Name,
        item.data!.Business_Type,
        item.data!.Business_Sector,
        item.data!.Zip_Code,
        item.data!.Address_Detail_1
      ]);
    }
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `거래처등록_업로드양식_${today}.xlsx`);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 sm:px-8 bg-white border-b border-slate-200 shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
            <UploadCloud className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-800">
            사업자등록증 정보 추출기 <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 rounded-full uppercase tracking-wider hidden sm:inline-block">v2.5 Multi-File</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button 
            type="button"
            id="kakao-test-btn"
            onClick={() => {
              setShowKakaoTest(true);
              setTestResult(null);
            }} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 hover:border-amber-300 rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            카카오 API 연동 확인
          </button>
          
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-md border border-emerald-100">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-xs font-medium text-emerald-700">시스템 정상</span>
          </div>
          <div className="hidden md:flex w-10 h-10 rounded-full bg-slate-200 border border-slate-300 items-center justify-center text-slate-400">
             <span className="text-sm font-medium">U</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6 gap-4 sm:gap-6">
        {/* Top Section: Upload & Queue */}
        <section className="w-full flex flex-col gap-4 flex-shrink-0 min-h-[300px] h-[40vh]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
               Document Queue
               {files.length > 0 && (
                 <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[10px]">{files.length}</span>
               )}
            </h2>
            {files.length > 0 && (
              <button 
                onClick={resetAll} 
                className="text-xs text-slate-400 hover:text-red-500 font-medium transition-colors"
                disabled={isProcessing}
              >
                전체 초기화
              </button>
            )}
          </div>
          
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
             {files.length === 0 ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex-1 flex flex-col items-center justify-center cursor-pointer transition-colors p-8 text-center m-4 rounded-xl border-2 border-dashed ${isHovering ? "border-indigo-500 bg-indigo-50/50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"}`}
                >
                  <input 
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={(e) => e.target.files && handleFileSelection(e.target.files)}
                      accept=".jpg,.jpeg,.png,.pdf,.zip,application/zip"
                      multiple
                  />
                  <div className="bg-white p-4 rounded-full shadow-sm border border-slate-100 mb-4">
                    <UploadCloud className="w-8 h-8 text-indigo-500" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1">파일 업로드 (다중 선택 가능)</h3>
                  <p className="text-xs text-slate-500 mb-6 font-medium">JPEG, PNG, PDF, 또는 ZIP 파일 지원</p>
                  
                  <button className="px-5 py-2 bg-slate-800 text-white text-xs font-semibold rounded shadow-sm hover:bg-slate-700 transition-colors">
                     파일 찾기
                  </button>
                </div>
             ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Small Sticky Dropzone */}
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-3 m-3 border border-dashed rounded-lg flex items-center justify-center gap-3 cursor-pointer transition-colors ${isHovering ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"}`}
                  >
                     <input 
                        type="file" 
                        className="hidden" 
                        ref={fileInputRef} 
                        onChange={(e) => e.target.files && handleFileSelection(e.target.files)}
                        accept=".jpg,.jpeg,.png,.pdf,.zip,application/zip"
                        multiple
                     />
                     <UploadCloud className="w-4 h-4 text-slate-400" />
                     <span className="text-xs font-medium text-slate-600">더 많은 파일 또는 ZIP 추가하기 (클릭/드래그)</span>
                  </div>
                  
                  {/* Queue List */}
                  <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                     {files.map(f => (
                       <div key={f.id} className={`flex items-center gap-3 p-3 rounded-lg border ${f.status === 'uploading' ? 'border-indigo-300 bg-indigo-50/30' : f.status === 'error' ? 'border-red-200 bg-red-50/50' : 'border-slate-100 bg-white hover:border-slate-200'} shadow-sm transition-colors relative overflow-hidden group`}>
                          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-slate-500">
                             <FileIcon className="w-4 h-4" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                             <p className="text-xs font-bold text-slate-700 truncate">{f.file.name}</p>
                             <div className="flex items-center gap-2 mt-0.5">
                               {f.status === 'pending' && <><Clock className="w-3 h-3 text-slate-400" /><span className="text-[10px] text-slate-500 font-medium">대기 중</span></>}
                               {f.status === 'uploading' && <><span className="text-[10px] text-indigo-600 font-bold">분석 중...</span></>}
                               {f.status === 'success' && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /><span className="text-[10px] text-emerald-600 font-bold">완료</span></>}
                                {f.status === 'error' && <><AlertCircle className="w-3 h-3 text-red-500" /><span className="text-[10px] text-red-600 font-medium truncate max-w-[150px]" title={f.error}>{f.error}</span><button onClick={() => retryFile(f.id)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline ml-2 cursor-pointer flex-shrink-0" type="button">재시도</button></>}
                             </div>
                          </div>
                          
                          {f.status === 'uploading' && (
                            <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin flex-shrink-0" />
                          )}
                          
                          {f.status !== 'uploading' && (
                             <button onClick={() => removeFile(f.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="목록에서 제거">
                                <Trash2 className="w-3.5 h-3.5" />
                             </button>
                          )}
                          
                          {f.status === 'uploading' && (
                            <div className="absolute bottom-0 left-0 h-0.5 bg-indigo-500/50 shadow-[0_0_8px_rgba(79,70,229,0.5)] z-20 overflow-hidden w-full">
                               <div className="h-full bg-indigo-600 animate-pulse w-full"></div>
                            </div>
                          )}
                       </div>
                     ))}
                  </div>
                </div>
             )}
          </div>
          
           {error && (
              <div className="w-full p-3 flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100 flex-shrink-0 shadow-sm relative">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 text-red-500" />
                <p className="font-medium pr-6">{error}</p>
                <button onClick={() => setError(null)} className="absolute top-3 right-3 text-red-400 hover:text-red-700">
                  <span className="sr-only">Close</span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
           )}
        </section>

        {/* Bottom Section: Results Grid */}
        <section className="flex-1 flex flex-col gap-4 overflow-hidden h-full">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Extracted Data Grid</h2>
            <div className="flex items-center gap-3">
               <span className="text-xs font-bold text-emerald-600 hidden sm:inline-block">추출 성공: {successfulFiles.length}건</span>
               <button 
                 onClick={downloadExcel}
                 disabled={successfulFiles.length === 0}
                 className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold shadow-md flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
               >
                  <Download className="w-3.5 h-3.5" />
                  거래처 정보 엑셀 다운로드
               </button>
            </div>
          </div>
          
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto relative">
               {successfulFiles.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-slate-50/50">
                     <FileText className="w-12 h-12 mb-4 opacity-20 text-slate-500" />
                     {files.length === 0 ? (
                       <p className="text-sm font-bold text-slate-600">파일을 업로드하면 이곳에 결과표가 나타납니다.</p>
                     ) : isProcessing ? (
                       <div className="space-y-4 flex flex-col items-center">
                         <div className="flex gap-1.5">
                           <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                           <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                           <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                         </div>
                         <p className="text-sm font-bold text-indigo-600 tracking-wide">문서 분석 및 데이터 추출 중...</p>
                       </div>
                     ) : (
                       <p className="text-sm font-bold text-slate-600">성공적으로 분석된 파일이 없습니다.</p>
                     )}
                  </div>
               ) : (
                  <table className="w-full text-[11px] sm:text-xs text-left whitespace-nowrap min-w-max">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider sticky top-0 z-10 shadow-sm border-b border-slate-200">
                      <tr>
                        <th className="p-3 font-bold border-r border-slate-200 bg-slate-100">원본 파일명</th>
                        {Object.values(fieldLables).map((label, idx) => (
                          <th key={idx} className="p-3 font-bold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {successfulFiles.map(f => (
                        <tr key={f.id} className="hover:bg-slate-50 transition-colors group">
                           <td className="p-3 font-medium text-slate-600 border-r border-slate-100 max-w-[120px] sm:max-w-[150px] truncate" title={f.file.name}>
                              {f.file.name}
                           </td>
                           <td className="p-3 text-slate-500">{f.data!.Company_Code}</td>
                           <td className="p-3 text-slate-500">{f.data!.Client_Type}</td>
                           <td className="p-3 text-slate-500">{f.data!.Client_Code}</td>
                           <td className="p-3 text-slate-800 font-bold">{f.data!.Company_Name}</td>
                           <td className="p-3 text-slate-700 font-semibold">{f.data!.Company_Name_Abbrev}</td>
                           <td className="p-3 font-mono font-bold text-indigo-700">{f.data!.Business_Number}</td>
                           <td className="p-3 text-slate-700">{f.data!.CEO_Name}</td>
                           <td className="p-3 text-slate-600">{f.data!.Business_Type}</td>
                           <td className="p-3 text-slate-600 max-w-[150px] truncate" title={f.data!.Business_Sector}>{f.data!.Business_Sector}</td>
                           <td className="p-3 font-mono text-slate-700 font-semibold">{f.data!.Zip_Code}</td>
                           <td className="p-3 text-slate-600 max-w-[150px] sm:max-w-[200px] truncate" title={f.data!.Address_Detail_1}>{f.data!.Address_Detail_1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between flex-shrink-0">
               <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                 <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 
                 사내 거래처 등록 엑셀 양식 포맷팅
               </div>
               
               <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
                 Queue: {files.length} | Success: {successfulFiles.length} | Errors: {files.filter(f => f.status === 'error').length}
               </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="h-12 bg-white border-t border-slate-200 px-8 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 font-medium flex-shrink-0 hidden sm:flex">
        <div className="flex gap-6 uppercase tracking-widest">
           <span>Model: {modelName}</span>
           <span>Data Integration: XLSX Download</span>
           <span>Queue Mode: Async</span>
        </div>
        <div>&copy; 2026 Enterprise Data Intelligence Team</div>
      </footer>

      {/* Kakao API Diagnostic Modal */}
      {showKakaoTest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-amber-50 px-6 py-4 border-b border-amber-200/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="font-bold text-slate-800 text-sm">카카오 API 연동 및 우편번호 조회 진단</span>
              </div>
              <button 
                onClick={() => setShowKakaoTest(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="목록에서 제거"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto">
              <p className="text-xs text-slate-500 leading-relaxed">
                사업자등록증에서 가공된 주소를 통해 카카오 로컬 API 서비스에서 우편번호(5자리 국가기초구역번호)를 정상적으로 찾아올 수 있는지 직접 조회 테스트를 해볼 수 있습니다.
              </p>

              {/* Address Form Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">검색할 테스트 주소</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={testAddress} 
                    onChange={(e) => setTestAddress(e.target.value)}
                    placeholder="예: 서울 연세로 50" 
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runKakaoTest();
                    }}
                  />
                  <button 
                    onClick={runKakaoTest}
                    disabled={isTestingKakao || !testAddress.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-lg text-xs transition-colors flex shadow-sm items-center gap-1.5"
                  >
                    {isTestingKakao ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : null}
                    조회 테스트
                  </button>
                </div>
              </div>

              {/* Diagnostic Results Loading & Preview Block */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                {isTestingKakao && (
                  <div className="py-8 text-center flex flex-col items-center justify-center space-y-3">
                    <div className="w-6 h-6 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-xs font-medium text-slate-600">카카오 API 서버와 통신 진단 중...</p>
                  </div>
                )}

                {!isTestingKakao && !testResult && (
                  <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                    <p className="text-xs text-slate-400 font-medium">조회 테스트 버튼을 누르면 연동 결과를 진단합니다.</p>
                  </div>
                )}

                {!isTestingKakao && testResult && (
                  <div className="space-y-3 animate-fade-in">
                    {testResult.ok ? (
                      <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl p-4">
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-emerald-800">카카오 API 연동이 아주 올바르게 완료되었습니다! ✅</h4>
                            <p className="text-[11px] text-emerald-700 leading-relaxed font-medium">
                              서버에 등록하신 <code className="bg-emerald-100 px-1 py-0.2 rounded text-[10px]">KAKAO_REST_API_KEY</code>를 활용해 카카오 데이터베이스에서 우편번호를 성공적으로 받아왔습니다.
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-emerald-200/30 grid grid-cols-2 gap-2 text-[11px] font-medium text-slate-600">
                          <div>
                            <span className="text-slate-400 block text-[10px]">입력검색어</span>
                            <span className="text-slate-700 font-bold">{testResult.query}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">매칭 표준 주소</span>
                            <span className="text-slate-700 font-bold truncate block" title={testResult.matchedAddress || ""}>
                              {testResult.matchedAddress || "식별안됨"}
                            </span>
                          </div>
                          <div className="col-span-2 pt-2">
                            <span className="text-slate-400 block text-[10px]">반환된 우편번호 (5자리)</span>
                            <span className="text-indigo-600 font-bold text-xs bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded inline-block">
                              {testResult.zipCode}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="bg-red-50 border border-red-200/60 rounded-xl p-4 flex items-start gap-2.5">
                          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-red-800">연동에 실패했습니다 ❌</h4>
                            <p className="text-[11px] text-red-700 font-medium leading-relaxed">
                              {testResult.error}
                            </p>
                          </div>
                        </div>

                        {testResult.advice && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[11px] text-slate-600 leading-relaxed space-y-1">
                            <span className="font-bold text-slate-700 text-xs block">💡 비개발자를 위한 도움말</span>
                            <p>{testResult.advice}</p>
                            <p className="text-[10px] text-slate-400 font-medium pt-1">
                              * REST API 키를 새로 등록했을 때는 설정 변경 후 약 5초 정도 서버의 반영 대기 시간이 소요될 수 있습니다.
                            </p>
                          </div>
                        )}

                        {testResult.rawResponse && (
                          <div className="bg-slate-900 text-slate-300 rounded-lg p-3 text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                            <span className="text-slate-500 block border-b border-slate-800 pb-1 mb-1 font-bold font-sans">API 실시간 오류 전문</span>
                            {testResult.rawResponse}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end">
              <button 
                onClick={() => setShowKakaoTest(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                진단 창 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
