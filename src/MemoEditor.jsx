import DocumentFullscreenContext from './DocumentFullscreenContext.js';
import {documentPatch} from '../shared/document-patch.js';
import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { BlockNoteSchema, defaultBlockSpecs, createHeadingBlockSpec, combineByGroup } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import { ko } from '@blocknote/core/locales';
import { memoCodeSpec, memoSyntaxHighlighter } from './memoCode.js';
import { memoEditingExtension } from './memoEditing.js';
import { createReactMathBlockSpec, createReactInlineMathSpec, getMathSlashMenuItems, getMathBlockTypeSelectItems, locales as mathLocales } from '@blocknote/math-block';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote, getDefaultReactSlashMenuItems, SuggestionMenuController, FormattingToolbarController, FormattingToolbar, blockTypeSelectItems, getFormattingToolbarItems, BasicTextStyleButton, useEditorState, LinkToolbarController, LinkToolbar, EditLinkButton, DeleteLinkButton, useComponentsContext, useBlockNoteEditor, FilePanel, FilePanelController, UploadTab, ReactImageBlock, ReactFileBlock, BlockNoteContext } from '@blocknote/react';
import '@blocknote/mantine/style.css';
import './memo.css';
import Icon from './Icon.jsx';
import {useDocumentFullscreen} from './documentView.js';
import Menu from './Menu.jsx';
import MemoOutline from './MemoOutline.jsx';
import { memoSearchRanges } from './memoNavigation.js';
import { useTheme } from './ThemeProvider.jsx';
import { memoEntry, loadMemo, changeMemo, saveMemo, latestMemo, downloadMemoDraft } from './memoStore.js';

const { audio: _audio, video: _video, ...specs } = defaultBlockSpecs;
const schema = BlockNoteSchema.create({ blockSpecs: specs }).extend({ blockSpecs: { heading: createHeadingBlockSpec({levels:[1,2,3,4],allowToggleHeadings:false}), image: ReactImageBlock(), file: ReactFileBlock(), codeBlock: memoCodeSpec, mathBlock: createReactMathBlockSpec() }, inlineContentSpecs: { math: createReactInlineMathSpec() } });
const dictionary = { ...ko, math: mathLocales.ko || mathLocales.en, placeholders: { ...ko.placeholders, default: '내용을 입력하거나 /로 블록을 추가하세요' } };
const editorTheme = { fontFamily: 'SUIT, sans-serif', borderRadius: 7, colors: { editor: { text: 'var(--theme-text-main)', background: 'var(--theme-surface-script)' }, menu: { text: 'var(--theme-text-main)', background: 'var(--theme-surface-control)' }, hovered: { text: 'var(--theme-text-main)', background: 'var(--theme-surface-hover)' }, selected: { text: 'var(--theme-text-main)', background: 'var(--theme-surface-selected)' }, border: 'var(--theme-border-subtle)', sideMenu: 'var(--theme-text-muted)', tooltip: { text: 'var(--theme-text-main)', background: 'var(--theme-surface-control)' } }};
const MemoErrorContext = createContext(() => {});
function MemoFileDownloadButton() {
  const Components = useComponentsContext(), editor = useBlockNoteEditor(), report = useContext(MemoErrorContext);
  const block = useEditorState({ editor, selector: ({ editor }) => { const blocks = editor.getSelection()?.blocks || [editor.getTextCursorPosition().block]; return blocks.length === 1 && blocks[0].props.url?.startsWith('loxt-asset:') ? blocks[0] : undefined; } });
  if (!block) return null;
  return <Components.FormattingToolbar.Button className="bn-button" label="첨부파일 저장" mainTooltip="첨부파일 저장" icon={<Icon name="download"/>} onClick={() => window.desktop.memos.openLink({ url: block.props.url, name: block.props.name }).catch(failure => report(failure.message))}/>;
}
function MemoFormattingToolbar() { const editor = useBlockNoteEditor(); const items = [...blockTypeSelectItems(editor.dictionary), ...getMathBlockTypeSelectItems(editor)]; return <FormattingToolbar>{getFormattingToolbarItems(items).filter(item => item.key !== 'fileDownloadButton')}<BasicTextStyleButton basicTextStyle="code"/><MemoFileDownloadButton/></FormattingToolbar>; }
function MemoLinkToolbar(props) {
  const Components = useComponentsContext(), report = useContext(MemoErrorContext);
  return <LinkToolbar {...props}><EditLinkButton {...props}/><Components.LinkToolbar.Button className="bn-button" label="링크 열기" mainTooltip="링크 열기" icon={<Icon name="link"/>} onClick={() => window.desktop.memos.openLink(props.url).catch(failure => report(failure.message))}/><DeleteLinkButton range={props.range} setToolbarOpen={props.setToolbarOpen}/></LinkToolbar>;
}
function UploadOnlyPanel(props) { const editor = useBlockNoteEditor(); const [loading, setLoading] = useState(false); return <FilePanel {...props} tabs={[{ name: loading ? '파일 저장 중…' : editor.dictionary.file_panel.upload.title, tabPanel: <UploadTab blockId={props.blockId} setLoading={setLoading}/> }]}/>; }
export default function MemoEditor({ id, title, compact = false, readOnly = false, onClose, documentHeader, onBack }) {
  const entry = memoEntry(id);
  const state = useSyncExternalStore(callback => { entry.listeners.add(callback); return () => entry.listeners.delete(callback); }, () => entry.state);
  useEffect(() => { void loadMemo(id); }, [id]);
  if (state.loading) return <div className="memo-loading" role="status">메모를 불러오는 중…</div>;
  if (!state.blocks) return <div className="memo-loading error-message" role="alert">{state.error}<button className="secondary" onClick={() => loadMemo(id)}>다시 시도</button>{onClose ? <button className="secondary" onClick={onClose}>닫기</button> : null}</div>;
  return <Editor id={id} title={title} initial={state.blocks} state={state} compact={compact} readOnly={readOnly} onClose={onClose} documentHeader={documentHeader} onBack={onBack}/>;
}
function Editor({ id, title, initial, state, compact, readOnly, onClose, documentHeader, onBack }) {
  const { theme } = useTheme(), root = useRef(null), scroll = useRef(null), outlineButton = useRef(null), searchInput = useRef(null), copyTimer = useRef(null), outlineTimer = useRef(null);
  const unique = useId().replace(/[^a-zA-Z0-9]/g, ''), outlineId = `memo-outline-${unique}`, highlight = `memo-search-${unique}`, activeHighlight = `memo-active-${unique}`;
  const ownFullscreen=useDocumentFullscreen(root); const sharedFullscreen=useContext(DocumentFullscreenContext); const [fullscreen,toggleFullscreen]=sharedFullscreen || ownFullscreen;
  const [searchOpen, setSearchOpen] = useState(false), [outlineOpen, setOutlineOpen] = useState(false), [outlineMounted, setOutlineMounted] = useState(false), [query, setQuery] = useState(''), [matches, setMatches] = useState([]), [matchIndex, setMatchIndex] = useState(-1), [searching, setSearching] = useState(false), [limited, setLimited] = useState(false), [error, setError] = useState(''), [exporting, setExporting] = useState(false), [copied, setCopied] = useState(false);
  const editor = useCreateBlockNote({ schema, dictionary, initialContent: initial, resolveFileUrl: window.desktop.assetUrl || (async url => url), tabBehavior: 'prefer-indent', extensions: [memoEditingExtension, memoSyntaxHighlighter], uploadFile: async file => {
    try { if (file.size > 32 * 1024 * 1024) throw new Error('32 MB 이하의 파일을 첨부해 주세요.'); return await window.desktop.memos.attach({ id, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }); }
    catch (failure) { setError(failure.message); throw failure; }
  } }, [id]);
  const applying = useRef(false),appliedBlocks=useRef(initial);
  useEffect(() => editor.onChange(() => { if(!applying.current){appliedBlocks.current=editor.document;changeMemo(id,editor.document);} }), [editor, id]);
  useEffect(() => {
    if(!state.blocks||state.blocks===appliedBlocks.current)return;
    const changes=documentPatch(appliedBlocks.current,state.blocks),view=editor.prosemirrorView,selection=view?.state.selection.toJSON(),scroll=root.current?.querySelector('.bn-editor')?.parentElement,top=scroll?.scrollTop;
    // A local store echo must not clear ProseMirror's input-rule undo metadata.
    if (!changes.order && !changes.upsert.length && !changes.remove.length) { appliedBlocks.current = state.blocks; return; }
    applying.current=true;
    try{
      if(changes.order)editor.replaceBlocks(editor.document,state.blocks);
      else for(const block of changes.upsert)editor.updateBlock(block.id,block);
      appliedBlocks.current=state.blocks;
      if(selection&&view){try{const restored=view.state.selection.constructor.fromJSON(view.state.doc,selection);view.dispatch(view.state.tr.setSelection(restored));}catch{/* A deleted/shortened block cannot retain its old text range. */}}
      if(scroll)scroll.scrollTop=top;
    }finally{applying.current=false;}
  }, [editor, state.blocks]);
  useEffect(() => () => { void saveMemo(id).catch(() => {}); }, [id]);
  useEffect(() => () => { clearTimeout(copyTimer.current); clearTimeout(outlineTimer.current); }, []);
  useEffect(() => {
    const registry = window.CSS?.highlights;
    setMatches([]); setMatchIndex(-1); setLimited(false); registry?.delete(highlight); registry?.delete(activeHighlight);
    if (!searchOpen || !query.trim()) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      const result = memoSearchRanges(root.current?.querySelector('.bn-editor'), query);
      if (registry && window.Highlight) registry.set(highlight, new Highlight(...result.ranges));
      setMatches(result.ranges); setLimited(result.truncated); setSearching(false);
    }, 150);
    return () => { clearTimeout(timer); registry?.delete(highlight); registry?.delete(activeHighlight); };
  }, [query, searchOpen, state.blocks, highlight, activeHighlight]);
  useEffect(() => {
    const range = matches[matchIndex], registry = window.CSS?.highlights;
    registry?.delete(activeHighlight); if (!range || !range.startContainer.isConnected) return;
    if (registry && window.Highlight) registry.set(activeHighlight, new Highlight(range));
    const box = range.getBoundingClientRect(), host = scroll.current;
    host?.scrollTo({ top: Math.max(0, box.top - host.getBoundingClientRect().top + host.scrollTop - host.clientHeight / 2), behavior: 'auto' });
    return () => registry?.delete(activeHighlight);
  }, [matches, matchIndex, activeHighlight]);
  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);
  const find = direction => { if (matches.length) setMatchIndex(index => index < 0 ? direction > 0 ? 0 : matches.length - 1 : (index + direction + matches.length) % matches.length); };
  function closeOutline(restore = true) { clearTimeout(outlineTimer.current); setOutlineOpen(false); outlineTimer.current = setTimeout(() => setOutlineMounted(false), window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 240); if (restore) outlineButton.current?.focus(); }
  function toggleOutline() { if (outlineOpen) closeOutline(); else { clearTimeout(outlineTimer.current); setOutlineMounted(true); setOutlineOpen(true); } }
  async function exportDocument(format) {
    setError(''); setExporting(true);
    try { await saveMemo(id); const [html, markdown] = await Promise.all([editor.blocksToHTMLLossy(), editor.blocksToMarkdownLossy()]); await window.desktop.memos.export({ id, title, format, html, markdown }); }
    catch (failure) { setError(failure.message); } finally { setExporting(false); }
  }
  async function copyCode() {
    const block = editor.getTextCursorPosition().block;
    if (block.type !== 'codeBlock') { setError('복사할 코드 블록에 커서를 놓아 주세요.'); return; }
    try { await window.desktop.memos.copy(block.content.map(item => item.text || '').join('')); setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1500); } catch { setError('코드를 복사하지 못했습니다.'); }
  }
  return <div ref={root} className={`memo-editor ${compact ? 'memo-editor-compact' : ''} ${fullscreen&&!sharedFullscreen?'document-fullscreen':''}`} onKeyDownCapture={event => { if (event.key === 'Escape' && !outlineOpen && !readOnly && event.target.closest('.bn-editor') && !document.querySelector('.bn-suggestion-menu') && editor._tiptapEditor.commands.undoInputRule()) { event.preventDefault(); event.stopPropagation(); } }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); event.stopPropagation(); setSearchOpen(true); } if (event.key === 'Escape' && outlineOpen) { event.preventDefault(); event.stopPropagation(); closeOutline(); } else if (event.key === 'Escape' && searchOpen) { event.stopPropagation(); setSearchOpen(false); } }} onClickCapture={event => {
    const link = event.target.closest('a[href]'); if (!link) return; event.preventDefault(); event.stopPropagation(); window.desktop.memos.openLink(link.href).catch(failure => setError(failure.message));
  }}>
    <style>{`::highlight(${highlight}){background:#bca66080;color:inherit}::highlight(${activeHighlight}){background:var(--theme-surface-selected);color:var(--theme-text-main)}`}</style><div className="memo-toolbar">{onBack?<button className="document-back" aria-label="보관함으로 돌아가기" onClick={async()=>{await saveMemo(id);onBack();}}><Icon name="back"/></button>:null}{compact ? <strong>메모</strong> : null}<span className={`memo-save-status ${state.error ? 'has-error' : ''}`} role="status">{state.error ? '저장 실패' : state.saving || state.dirty ? '저장 중…' : '저장됨'}</span>{documentHeader}<div className="memo-tools"><button className="script-export" aria-label="메모에서 찾기" title="메모에서 찾기 · Ctrl + F" aria-pressed={searchOpen} onClick={() => setSearchOpen(value => !value)}><Icon name="search"/></button><button ref={outlineButton} className="script-export memo-outline-toggle" aria-label="메모 목차" title="목차" aria-expanded={outlineOpen} aria-controls={outlineId} onClick={toggleOutline}><Icon name="list"/><span>목차</span></button><Menu disabled={readOnly} label="편집 도구" trigger={<Icon name="more"/>}>{close => <><button role="menuitem" onClick={() => { close(); editor.undo(); }} title="Ctrl + Z">실행 취소</button><button role="menuitem" onClick={() => { close(); editor.redo(); }} title="Ctrl + Shift + Z">다시 실행</button><button role="menuitem" onClick={() => { close(); copyCode(); }}>{copied ? '복사됨' : '코드 복사'}</button></>}</Menu><Menu label="메모 내보내기" disabled={exporting} trigger={<><Icon name="download"/><span>내보내기</span><Icon name="chevronDown"/></>}>{close => ['md','html','pdf'].map(format => <button role="menuitem" key={format} onClick={() => { close(); exportDocument(format); }}>{format === 'md' ? 'Markdown (.md)' : format.toUpperCase()}</button>)}</Menu><button className="script-export" aria-label={fullscreen?'전체화면 종료':'전체화면'} aria-pressed={fullscreen} onClick={toggleFullscreen}><Icon name={fullscreen?'collapse':'expand'}/></button>{onClose ? <button className="script-export" aria-label="메모 닫기" onClick={onClose}><Icon name="close"/></button> : null}</div></div>
    {searchOpen ? <div className="memo-search"><input ref={searchInput} aria-label="메모 검색어" placeholder="메모에서 찾기" value={query} maxLength={500} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); find(event.shiftKey ? -1 : 1); } }}/><span aria-live="polite">{searching ? '검색 중…' : matchIndex >= 0 ? `${matchIndex + 1} / ${matches.length}${limited ? '+' : ''}` : `${matches.length}${limited ? '+' : ''}개`}</span><button aria-label="이전 검색 결과" disabled={!matches.length} onClick={() => find(-1)}>↑</button><button aria-label="다음 검색 결과" disabled={!matches.length} onClick={() => find(1)}>↓</button></div> : null}
    {state.error || error ? <div className="error-message memo-error" role="alert">{state.error || error}{state.error ? <><button className="secondary" onClick={() => saveMemo(id).catch(() => {})}>다시 시도</button><button className="secondary" onClick={() => downloadMemoDraft(id)}>내 초안 백업</button><button className="secondary" onClick={() => latestMemo(id).catch(failure => setError(failure.message))}>최신 내용 보기</button></> : <button className="secondary" onClick={() => setError('')}>닫기</button>}</div> : null}
    {state.recovered ? <p className="recovery-message memo-error">메모 백업을 표시하고 있습니다. 마지막 수정 일부는 포함되지 않을 수 있습니다. 편집해 저장하면 손상된 원본을 별도 보관합니다.</p> : null}
    <div className={`memo-body ${outlineMounted ? 'memo-outline-open' : ''}`}><div ref={scroll} className="memo-scroll"><MemoErrorContext.Provider value={setError}><BlockNoteContext.Provider value={{ editor, colorSchemePreference: theme }}><BlockNoteView editable={!readOnly} editor={editor} theme={editorTheme} data-loxt-theme={theme} slashMenu={false} formattingToolbar={false} linkToolbar={false} sideMenu={false} filePanel={false}>
      <FormattingToolbarController formattingToolbar={MemoFormattingToolbar}/>
      <LinkToolbarController linkToolbar={MemoLinkToolbar}/>
      <SuggestionMenuController triggerCharacter="/" getItems={async query => filterSuggestionItems(combineByGroup(getDefaultReactSlashMenuItems(editor), getMathSlashMenuItems(editor)), query)}/>
      <FilePanelController filePanel={UploadOnlyPanel}/>
    </BlockNoteView></BlockNoteContext.Provider></MemoErrorContext.Provider></div>{outlineMounted ? <MemoOutline id={outlineId} blocks={state.blocks} root={root} scroll={scroll} onClose={closeOutline} closing={!outlineOpen}/> : null}</div>
    {readOnly ? <div className="memo-hint">휴지통의 메모입니다. 복구한 뒤 편집할 수 있습니다.</div> : null}
  </div>;
}
