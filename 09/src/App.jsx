import { useEffect, useRef, useState } from 'react';
import { ArrowBendDownLeftIcon, CheckCircleIcon, CheckIcon, CopyIcon, ImageIcon, LinkSimpleIcon, PlusIcon, SpinnerGapIcon, UploadSimpleIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import { getPalette } from 'colorthief';
import { readPalettes, savePalette } from './storage.js';
import { downloadImage, getDroppedUrl } from './remote-image.js';

const examples = [
  { id: 'sample-house', name: 'summer-house.jpg', image: '/assets/summer-house.png', colors: ['#E8A98B', '#C96F4E', '#F4E6D7', '#3E7EC6', '#1E3A6E'], sample: true },
  { id: 'sample-ceramic', name: 'ceramic.jpg', image: '/assets/ceramic.png', colors: ['#5A6C4C', '#98AC92', '#DAD9C9', '#AF9470', '#39382B'], sample: true },
  { id: 'sample-coast', name: 'coast.jpg', image: '/assets/coast.png', colors: ['#2D76AA', '#68A5C9', '#D3E6EF', '#E8D9BC', '#95866A'], sample: true },
];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 읽지 못했어요. 다른 파일을 선택해 주세요.'));
    image.src = url;
  });
}

async function createPalette(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('JPG, PNG, WEBP 이미지를 선택해 주세요.');
  if (file.size > 20 * 1024 * 1024) throw new Error('20MB 이하의 이미지를 선택해 주세요.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = await getPalette(canvas, { colorCount: 5, quality: 5 });
    if (!result?.length) throw new Error('이미지에서 색을 찾지 못했어요. 투명하지 않은 사진을 선택해 주세요.');
    const uniqueColors = [...new Set(result.map(color => color.hex().toUpperCase()))];
    const colors = Array.from({ length: 5 }, (_, index) => uniqueColors[index % uniqueColors.length]);
    const imageData = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
    return { id: crypto.randomUUID(), name: file.name, image: imageData, colors, uniqueCount: uniqueColors.length, createdAt: Date.now() };
  } finally { URL.revokeObjectURL(url); }
}

export function App() {
  const [palettes, setPalettes] = useState(examples);
  const [selectedId, setSelectedId] = useState(examples[0].id);
  const [copied, setCopied] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [urlError, setUrlError] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [unsaved, setUnsaved] = useState(new Set());
  const fileInput = useRef(null);
  const urlDialog = useRef(null);
  const urlInput = useRef(null);
  const urlTrigger = useRef(null);
  const busyRef = useRef(false);
  const copyTimer = useRef(null);
  const dragDepth = useRef(0);
  const selected = palettes.find(palette => palette.id === selectedId) || palettes[0];

  useEffect(() => {
    let cancelled = false;
    readPalettes().then(saved => {
      if (cancelled) return;
      setPalettes([...saved, ...examples]);
      if (saved.length) setSelectedId(saved[0].id);
    }).catch(() => {
      if (!cancelled) setError('브라우저 저장 공간에 접근할 수 없어요. 새로고침하면 새 팔레트가 사라질 수 있어요.');
    }).finally(() => { if (!cancelled) setStorageReady(true); });
    return () => { cancelled = true; clearTimeout(copyTimer.current); };
  }, []);

  function selectPalette(palette) {
    setSelectedId(palette.id);
    setCopied(-1);
    setAnnouncement(`${palette.name} 팔레트를 열었어요.`);
  }

  async function handleImport(loadFile, fromUrl = false) {
    if (busyRef.current || !storageReady) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setUrlError('');
    setCopied(-1);
    try {
      const file = await loadFile();
      const palette = await createPalette(file);
      try { await savePalette(palette); }
      catch {
        setUnsaved(current => new Set([...current, palette.id]));
        setError('팔레트는 만들었지만 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
      }
      setPalettes(current => [palette, ...current]);
      setSelectedId(palette.id);
      setAnnouncement(`${file.name}에서 색을 추출했어요. 보드에 팔레트가 추가됐어요.`);
      if (fromUrl) { urlDialog.current.close(); setUrlValue(''); }
    } catch (cause) {
      const message = cause.message || '색을 추출하지 못했어요. 다른 이미지로 다시 시도해 주세요.';
      if (fromUrl && urlDialog.current.open) setUrlError(message);
      else setError(message);
    }
    finally {
      busyRef.current = false;
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function handleFile(file) { if (file) handleImport(() => file); }
  function handleUrl(value) { handleImport(() => downloadImage(value), true); }
  function showUrlDialog() { setUrlError(''); urlDialog.current.showModal(); urlInput.current.focus(); }
  function isImageDrop(transfer) { return [...transfer.types].some(type => ['Files', 'text/uri-list', 'text/plain'].includes(type)); }

  async function copyColor(hex, index) {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(index);
      setAnnouncement(`${hex} 복사했어요.`);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(-1), 2300);
    } catch { setError(`복사 권한이 없어요. 색상 코드 ${hex}를 직접 선택해서 복사해 주세요.`); }
  }

  const openFilePicker = () => fileInput.current?.click();
  const saved = !selected.sample && !unsaved.has(selected.id);
  return (
    <div className="app"
      onDragEnter={event => { if (isImageDrop(event.dataTransfer)) { event.preventDefault(); dragDepth.current++; setDragging(true); } }}
      onDragOver={event => { if (isImageDrop(event.dataTransfer)) event.preventDefault(); }}
      onDragLeave={event => { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
      onDrop={event => {
        event.preventDefault(); dragDepth.current = 0; setDragging(false);
        if (event.dataTransfer.files.length) handleFile(event.dataTransfer.files[0]);
        else { const url = getDroppedUrl(event.dataTransfer); if (url) handleUrl(url); }
      }}>
      <header className="topbar">
        <div className="brand"><span className="wordmark">모음</span><span className="tagline">좋은 색을, 더 가까이</span></div>
        <div className="import-actions">
        <button ref={urlTrigger} className="url-button" aria-label="이미지 URL로 추가" onClick={showUrlDialog} disabled={busy || !storageReady}><LinkSimpleIcon size={20} /><span className="url-label-full">URL로 추가</span><span className="url-label-short">URL</span></button>
        <button className="primary-button" onClick={openFilePicker} disabled={busy || !storageReady}>
          {busy ? <SpinnerGapIcon className="spin" size={24} /> : <PlusIcon size={24} />}<span>{busy ? '색 추출 중' : '이미지 추가'}</span>
        </button>
        </div>
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="이미지 파일 선택" tabIndex={-1} onChange={event => handleFile(event.target.files[0])} />
      </header>
      <main>
        {error && <div className="error-banner" role="alert"><WarningCircleIcon size={20} /><span>{error}</span><button aria-label="알림 닫기" onClick={() => setError('')}><XIcon size={18} /></button></div>}
        <section className="workspace" aria-label="이미지와 추출한 팔레트">
          <div className="source-panel">
            <div className="intro">
              <div><h1>사진 한 장, 다섯 가지 색</h1><p>이미지를 올리고, 마음에 드는 색을 모아보세요.</p></div>
              <div className="drop-hint"><ArrowBendDownLeftIcon size={48} weight="thin" aria-hidden="true" /><span>이미지나 이미지 URL을<br />여기에 놓아주세요.</span></div>
            </div>
            <div className={`photo-stage${busy ? ' is-busy' : ''}`}>
              <img key={selected.id} src={selected.image} alt={`${selected.name} 원본 이미지`} className="source-photo" />
              {busy && <div className="processing" role="status"><SpinnerGapIcon className="spin" size={32} /><span>사진 속 색을 찾고 있어요</span></div>}
            </div>
          </div>
          <aside className="palette-panel" aria-labelledby="palette-title" aria-busy={busy}>
            <div className="palette-heading"><h2 id="palette-title">추출한 팔레트</h2>
              {selected.sample ? <span className="save-status sample-status"><ImageIcon size={17} />예시 팔레트</span> : saved ? <span className="save-status"><CheckCircleIcon weight="fill" size={19} />보드에 자동 저장됨</span> : <span className="save-status unsaved-status"><WarningCircleIcon size={18} />저장되지 않음</span>}
            </div>
            <p className="filename" title={selected.name}>{selected.name}</p>
            <div className="swatch-list">
              {selected.colors.map((hex, index) => (
                <button key={`${selected.id}-${index}`} className={`swatch-row${copied === index ? ' copied' : ''}`} onClick={() => copyColor(hex, index)} aria-label={`${hex} HEX 코드 복사`} title={`${hex} 복사`}>
                  <span className="color-block" style={{ backgroundColor: hex }} />
                  <span className="swatch-details"><span className="hex-code">{hex}</span><span className="copy-action">{copied === index ? <span className="copied-label"><CheckIcon size={18} />복사됨</span> : <CopyIcon size={22} />}</span></span>
                </button>
              ))}
            </div>
            <p className="palette-help">색을 클릭하면 HEX 코드가 복사돼요.</p>
            {selected.uniqueCount < 5 && <p className="limited-colors">색이 적은 이미지라 일부 색이 반복돼요.</p>}
          </aside>
        </section>
        <section className="collection" aria-labelledby="collection-title">
          <div className="collection-heading"><h2 id="collection-title">모아둔 팔레트 <span className="count">· {palettes.length}</span></h2><p>클릭하면 다시 불러올 수 있어요.</p></div>
          <div className="collection-grid">
            {palettes.map(palette => (
              <button key={palette.id} className={`palette-card${selected.id === palette.id ? ' selected' : ''}`} aria-pressed={selected.id === palette.id} aria-label={`${palette.name} 팔레트 열기`} onClick={() => selectPalette(palette)}>
                <span className="card-preview"><img src={palette.image} alt="" loading="lazy" /><span className="mini-colors">{palette.colors.map((hex, index) => <span key={index} style={{ backgroundColor: hex }} />)}</span></span>
                <span className="card-caption"><span className="card-name" title={palette.name}>{palette.name}</span>{palette.sample && <span className="sample-tag">예시</span>}</span>
              </button>
            ))}
          </div>
        </section>
        <footer className="local-note">이미지는 이 브라우저에만 저장돼요.<span>JPG · PNG · WEBP / 최대 20MB</span></footer>
      </main>
      <span role="status" className="visually-hidden" aria-live="polite">{announcement}</span>
      {dragging && <div className="drop-overlay"><UploadSimpleIcon size={52} weight="light" /><h2>이미지나 이미지 URL을 놓아주세요</h2><p>사진 속 다섯 가지 색을 모아드릴게요.</p></div>}
      <dialog ref={urlDialog} className="url-dialog" aria-labelledby="url-title" onClose={() => urlTrigger.current?.focus()} onCancel={event => { if (busy) event.preventDefault(); }}>
        <div className="dialog-heading"><h2 id="url-title">이미지 URL로 추가</h2><button className="dialog-close" type="button" aria-label="URL 입력 닫기" disabled={busy} onClick={() => urlDialog.current.close()}><XIcon size={22} /></button></div>
        <p className="dialog-description">웹에서 발견한 사진의 주소를 붙여넣어 주세요.</p>
        <form onSubmit={event => { event.preventDefault(); handleUrl(urlValue); }}>
          <label htmlFor="image-url">이미지 주소</label>
          <input ref={urlInput} id="image-url" type="url" required placeholder="https://example.com/photo.jpg" value={urlValue} onChange={event => { setUrlValue(event.target.value); setUrlError(''); }} disabled={busy} aria-describedby={urlError ? 'url-error url-help' : 'url-help'} aria-invalid={!!urlError} autoComplete="off" />
          <p id="url-help" className="url-help">사진을 우클릭한 뒤 <strong>이미지 주소 복사</strong>를 선택하세요. 일반 웹페이지 주소는 지원하지 않아요.</p>
          {urlError && <p id="url-error" className="url-error" role="alert"><WarningCircleIcon size={18} />{urlError}</p>}
          <button className="primary-button url-submit" disabled={busy || !storageReady} type="submit">{busy ? <SpinnerGapIcon className="spin" size={20} /> : <LinkSimpleIcon size={20} />}{busy ? '이미지 불러오는 중' : '팔레트 만들기'}</button>
        </form>
        <p className="url-alternative">주소가 없다면 아래 예시 팔레트 3개로 먼저 둘러보세요.</p>
      </dialog>
    </div>
  );
}
