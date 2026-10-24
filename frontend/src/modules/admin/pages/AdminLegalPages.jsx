import React, { useCallback, useEffect, useRef, useState } from 'react';
import Card from '@shared/components/ui/Card';
import { useToast } from '@shared/components/ui/Toast';
import LegalContent, { LEGAL_PLACEHOLDERS, formatLegalDate } from '@shared/components/legal/LegalContent';
import { cn } from '@/lib/utils';
import { adminApi } from '../services/adminApi';
import { LEGAL_TEMPLATES } from './legal/legalTemplates';
import {
    HiOutlineDocumentText,
    HiOutlineListBullet,
    HiOutlineLink,
    HiOutlineArrowUturnLeft,
    HiOutlineArrowUturnRight,
    HiOutlineCodeBracket,
    HiOutlineEye,
    HiOutlinePencilSquare,
} from 'react-icons/hi2';

const ROLES = [
    { id: 'CUSTOMER', label: 'Customer App', publicPath: { PRIVACY: '/privacy', TERMS: '/terms' } },
    { id: 'SELLER', label: 'Seller Panel' },
    { id: 'DELIVERY', label: 'Delivery App' },
];
const TYPES = [
    { id: 'PRIVACY', label: 'Privacy Policy' },
    { id: 'TERMS', label: 'Terms & Conditions' },
];
const MODES = [
    { id: 'edit', label: 'Editor', icon: HiOutlinePencilSquare },
    { id: 'html', label: 'HTML', icon: HiOutlineCodeBracket },
    { id: 'preview', label: 'Preview', icon: HiOutlineEye },
];

// Tags kept when text is pasted from Word / Google Docs / websites; everything else is unwrapped
const ALLOWED_TAGS = new Set(['H1', 'H2', 'H3', 'P', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'A', 'BR', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED']);

function cleanPastedHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const walk = (node) => {
        [...node.childNodes].forEach((child) => {
            if (child.nodeType === Node.COMMENT_NODE) {
                child.remove();
                return;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) return;
            if (DROP_TAGS.has(child.tagName)) {
                child.remove();
                return;
            }
            walk(child);
            if (!ALLOWED_TAGS.has(child.tagName)) {
                child.replaceWith(...child.childNodes);
                return;
            }
            const href = child.tagName === 'A' ? child.getAttribute('href') : null;
            [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
            if (href && !/^\s*javascript:/i.test(href)) child.setAttribute('href', href);
        });
    };
    walk(doc.body);
    return doc.body.innerHTML;
}

const isBlank = (html) => !String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();

const ToolButton = ({ onClick, title, children, className }) => (
    <button
        type="button"
        title={title}
        aria-label={title}
        // keep the text selection in the editor while clicking the toolbar
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn('flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-900', className)}
    >
        {children}
    </button>
);

const AdminLegalPages = () => {
    const { showToast } = useToast();
    const [role, setRole] = useState('CUSTOMER');
    const [type, setType] = useState('PRIVACY');
    const [saved, setSaved] = useState('');
    const [draft, setDraft] = useState('');
    const [updatedAt, setUpdatedAt] = useState(null);
    const [mode, setMode] = useState('edit');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const editorRef = useRef(null);

    const dirty = draft !== saved;
    const roleInfo = ROLES.find((r) => r.id === role);
    const typeInfo = TYPES.find((t) => t.id === type);

    // The editor is uncontrolled while typing (so the cursor never jumps); its HTML is pushed in on load / mode switch
    const loadIntoEditor = useCallback((html) => {
        if (editorRef.current) editorRef.current.innerHTML = html;
    }, []);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        adminApi
            .getLegalPage(role, type)
            .then((res) => {
                if (cancelled) return;
                const content = res.data?.result?.content || '';
                setSaved(content);
                setDraft(content);
                setUpdatedAt(res.data?.result?.updatedAt || null);
            })
            .catch(() => {
                if (cancelled) return;
                setSaved('');
                setDraft('');
                setUpdatedAt(null);
                showToast('Failed to load content', 'error');
            })
            .finally(() => !cancelled && setIsLoading(false));
        return () => {
            cancelled = true;
        };
    }, [role, type, showToast]);

    useEffect(() => {
        if (!isLoading && mode === 'edit') loadIntoEditor(draft);
        // only when the page finishes loading or the editor tab is shown again
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, mode, role, type]);

    // Warn before leaving the browser tab with unsaved text
    useEffect(() => {
        if (!dirty) return undefined;
        const onBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    const confirmDiscard = () => !dirty || window.confirm('You have unsaved changes. Discard them?');
    const switchPage = (nextRole, nextType) => {
        if ((nextRole === role && nextType === type) || !confirmDiscard()) return;
        setRole(nextRole);
        setType(nextType);
        setMode('edit');
    };

    const syncFromEditor = () => setDraft(editorRef.current?.innerHTML || '');

    const exec = (command, value = null) => {
        editorRef.current?.focus();
        document.execCommand(command, false, value);
        syncFromEditor();
    };

    const addLink = () => {
        const url = window.prompt('Link address (https://... or mailto:...)', 'https://');
        if (!url || /^\s*javascript:/i.test(url)) return;
        exec('createLink', url.trim());
    };

    const insertText = (text) => {
        if (mode !== 'edit') {
            setDraft((d) => `${d}${text}`);
            return;
        }
        exec('insertText', text);
    };

    const onPaste = (e) => {
        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');
        e.preventDefault();
        if (html) {
            document.execCommand('insertHTML', false, cleanPastedHtml(html));
        } else {
            const paragraphs = text
                .split(/\n{2,}/)
                .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`)
                .join('');
            document.execCommand('insertHTML', false, paragraphs);
        }
        syncFromEditor();
    };

    const applyTemplate = () => {
        if (!isBlank(draft) && !window.confirm('Replace the current text with the starter template?')) return;
        const template = LEGAL_TEMPLATES[type];
        setDraft(template);
        if (mode === 'edit') loadIntoEditor(template);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const content = isBlank(draft) ? '' : draft;
            const res = await adminApi.updateLegalPage(role, type, { content });
            if (res.data?.success) {
                const stored = res.data.result?.content ?? content;
                setSaved(stored);
                setDraft(stored);
                setUpdatedAt(res.data.result?.updatedAt || new Date().toISOString());
                if (mode === 'edit') loadIntoEditor(stored);
                showToast(`${typeInfo.label} saved. It is live now.`, 'success');
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to save content', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <div>
                <h1 className="ds-h1">Legal Pages</h1>
                <p className="ds-description">
                    Write and update the Privacy Policy and Terms & Conditions for each app. Changes are live as soon as you save.
                </p>
            </div>

            <div className="mt-8 flex flex-col gap-8 lg:flex-row">
                {/* Page picker */}
                <div className="w-full shrink-0 space-y-6 lg:w-64">
                    <Card className="rounded-2xl border-slate-100 bg-white p-4 shadow-sm">
                        <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-500">App</h3>
                        <div className="flex flex-col gap-2">
                            {ROLES.map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => switchPage(r.id, type)}
                                    className={cn('rounded-xl px-4 py-3 text-left text-sm font-bold transition-all', role === r.id ? 'bg-primary text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100')}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card className="rounded-2xl border-slate-100 bg-white p-4 shadow-sm">
                        <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-500">Page</h3>
                        <div className="flex flex-col gap-2">
                            {TYPES.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => switchPage(role, t.id)}
                                    className={cn('rounded-xl px-4 py-3 text-left text-sm font-bold transition-all', type === t.id ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100')}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card className="rounded-2xl border-slate-100 bg-white p-4 shadow-sm">
                        <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">Auto-filled details</h3>
                        <p className="mb-3 text-[11px] font-medium text-slate-500">
                            Click to insert. They are replaced with the values from General Settings, so the page stays correct if those change.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {LEGAL_PLACEHOLDERS.map((p) => (
                                <button
                                    key={p.key}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => insertText(p.key)}
                                    title={p.label}
                                    className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                                >
                                    {p.key}
                                </button>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Editor */}
                <div className="min-w-0 flex-1">
                    <Card className="flex h-full flex-col rounded-2xl border-slate-100 bg-white p-6 shadow-lg">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <HiOutlineDocumentText className="h-6 w-6" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-800">{typeInfo.label}</h2>
                                    <p className="text-xs font-bold text-slate-500">
                                        {roleInfo.label}
                                        {updatedAt && !isBlank(saved) ? ` · Last saved ${formatLegalDate(updatedAt)}` : ' · Not published yet'}
                                        {roleInfo.publicPath && !isBlank(saved) && (
                                            <>
                                                {' · '}
                                                <a href={roleInfo.publicPath[type]} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                                    View live page
                                                </a>
                                            </>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {dirty && <span className="text-xs font-bold text-amber-600">Unsaved changes</span>}
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || isLoading || !dirty}
                                    className="rounded-xl bg-primary px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-md transition-all hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Save & Publish'}
                                </button>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="flex min-h-[400px] flex-1 items-center justify-center">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            </div>
                        ) : (
                            <div className="flex flex-1 flex-col">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <div role="tablist" className="inline-flex rounded-xl bg-slate-100 p-1">
                                        {MODES.map((m) => (
                                            <button
                                                key={m.id}
                                                role="tab"
                                                aria-selected={mode === m.id}
                                                type="button"
                                                onClick={() => setMode(m.id)}
                                                className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition', mode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                                            >
                                                <m.icon className="h-4 w-4" /> {m.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={applyTemplate}
                                        className="text-xs font-bold text-primary underline-offset-2 hover:underline"
                                    >
                                        {isBlank(draft) ? 'Start from a template' : 'Replace with template'}
                                    </button>
                                </div>

                                {isBlank(draft) && mode === 'edit' && (
                                    <div className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
                                        This page is empty, so {roleInfo.label.toLowerCase()} users see "not available". Write it below or start from the template.
                                        Templates are a starting point; have the final text checked by a lawyer.
                                    </div>
                                )}

                                {mode === 'edit' && (
                                    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
                                        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
                                            <ToolButton title="Heading" onClick={() => exec('formatBlock', '<h2>')}>H2</ToolButton>
                                            <ToolButton title="Sub-heading" onClick={() => exec('formatBlock', '<h3>')}>H3</ToolButton>
                                            <ToolButton title="Normal text" onClick={() => exec('formatBlock', '<p>')} className="text-xs">Text</ToolButton>
                                            <span className="mx-1 h-5 w-px bg-slate-200" />
                                            <ToolButton title="Bold" onClick={() => exec('bold')} className="font-black">B</ToolButton>
                                            <ToolButton title="Italic" onClick={() => exec('italic')} className="italic">I</ToolButton>
                                            <ToolButton title="Underline" onClick={() => exec('underline')} className="underline">U</ToolButton>
                                            <span className="mx-1 h-5 w-px bg-slate-200" />
                                            <ToolButton title="Bullet list" onClick={() => exec('insertUnorderedList')}><HiOutlineListBullet className="h-5 w-5" /></ToolButton>
                                            <ToolButton title="Numbered list" onClick={() => exec('insertOrderedList')} className="text-xs">1.</ToolButton>
                                            <ToolButton title="Add link" onClick={addLink}><HiOutlineLink className="h-5 w-5" /></ToolButton>
                                            <ToolButton title="Clear formatting" onClick={() => exec('removeFormat')} className="text-xs">Clear</ToolButton>
                                            <span className="mx-1 h-5 w-px bg-slate-200" />
                                            <ToolButton title="Undo" onClick={() => exec('undo')}><HiOutlineArrowUturnLeft className="h-4 w-4" /></ToolButton>
                                            <ToolButton title="Redo" onClick={() => exec('redo')}><HiOutlineArrowUturnRight className="h-4 w-4" /></ToolButton>
                                        </div>
                                        <div
                                            ref={editorRef}
                                            contentEditable
                                            suppressContentEditableWarning
                                            role="textbox"
                                            aria-multiline="true"
                                            aria-label={`${typeInfo.label} text`}
                                            onInput={syncFromEditor}
                                            onBlur={syncFromEditor}
                                            onPaste={onPaste}
                                            className="legal-content min-h-[460px] flex-1 overflow-y-auto bg-white p-5 outline-none"
                                        />
                                    </div>
                                )}

                                {mode === 'html' && (
                                    <textarea
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        spellCheck={false}
                                        className="min-h-[500px] w-full flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700 outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
                                        placeholder="<h2>1. Information we collect</h2><p>...</p>"
                                    />
                                )}

                                {mode === 'preview' && (
                                    <div className="min-h-[500px] flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
                                        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-5 shadow-sm sm:p-6">
                                            <h2 className="text-xl font-bold text-slate-800">{typeInfo.label}</h2>
                                            <p className="mb-5 text-xs font-medium text-slate-500">
                                                Last updated: {formatLegalDate(dirty ? new Date() : updatedAt || new Date())}
                                            </p>
                                            {isBlank(draft) ? (
                                                <p className="text-sm text-slate-500">{typeInfo.label} is not available at the moment.</p>
                                            ) : (
                                                <LegalContent html={draft} />
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default AdminLegalPages;
