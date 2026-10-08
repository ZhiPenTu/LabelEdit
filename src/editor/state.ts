import type { Language, PDFDocument, Recognition, Rect, TextEdit, TextRegion } from './types';
import { overlaps } from './geometry';

export type Operation = 'opening' | 'recognizing' | 'applying' | 'exporting' | null;
export interface EditSnapshot { edits: TextEdit[]; regionsByPage: Record<number, TextRegion[]> }
export interface EditorState extends EditSnapshot {
  document: PDFDocument | null;
  page: number;
  recognitionByPage: Record<number, Recognition>;
  history: EditSnapshot[];
  selectedId: string | null;
  language: Language;
  operation: Operation;
  previewUrl: string | null;
  previewLoading: boolean;
  error: string | null;
  notice: string | null;
  download: { url: string; filename: string } | null;
}
export const initialEditorState: EditorState = {
  document: null, page: 0, regionsByPage: {}, recognitionByPage: {}, edits: [], history: [],
  selectedId: null, language: 'latin', operation: null, previewUrl: null, previewLoading: false,
  error: null, notice: null, download: null,
};
export type EditorAction =
  | { type: 'patch'; patch: Partial<EditorState> }
  | { type: 'opened'; document: PDFDocument; previewUrl: string }
  | { type: 'recognized'; page: number; result: Recognition; batch: string }
  | { type: 'rect'; id: string; page: number; rect: Rect }
  | { type: 'commit'; edits: TextEdit[]; snapshot: EditSnapshot; previewUrl: string; notice: string }
  | { type: 'undo'; snapshot: EditSnapshot; previewUrl: string };

export const snapshotOf = (state: EditorState): EditSnapshot => ({ edits: state.edits, regionsByPage: state.regionsByPage });
export const isBusy = (state: Pick<EditorState, 'operation' | 'previewLoading'>) => Boolean(state.operation || state.previewLoading);

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'patch': return { ...state, ...action.patch };
    case 'opened': return { ...initialEditorState, language: state.language, document: action.document, previewUrl: action.previewUrl, operation: 'recognizing' };
    case 'recognized': {
      const edited = new Set(state.edits.map(edit => edit.id));
      const preserved = (state.regionsByPage[action.page] ?? []).filter(region => region.source === 'manual' || edited.has(region.id));
      const fresh = action.result.regions.map(region => ({ ...region, id: `${action.batch}:${region.id}` }))
        .filter(region => !preserved.some(old => old.source !== 'manual' && overlaps(region.rect, old.rect)));
      const regions = [...fresh, ...preserved];
      return { ...state, regionsByPage: { ...state.regionsByPage, [action.page]: regions },
        recognitionByPage: { ...state.recognitionByPage, [action.page]: action.result },
        selectedId: state.page === action.page ? (regions.some(region => region.id === state.selectedId) ? state.selectedId : regions[0]?.id ?? null) : state.selectedId,
        notice: !action.result.regions.length ? '未识别到文字。可以使用「框选区域」手动添加修改。' : action.result.warnings?.join('；') || null };
    }
    case 'rect': return { ...state,
      regionsByPage: { ...state.regionsByPage, [action.page]: (state.regionsByPage[action.page] ?? []).map(region => region.id === action.id ? { ...region, rect: action.rect } : region) },
      edits: state.edits.map(edit => edit.id === action.id ? { ...edit, rect: action.rect } : edit), download: null, notice: null };
    case 'commit': return { ...state, edits: action.edits, history: [...state.history, action.snapshot], previewUrl: action.previewUrl, download: null, notice: action.notice };
    case 'undo': return { ...state, ...action.snapshot, history: state.history.slice(0, -1), previewUrl: action.previewUrl, download: null, notice: '已撤销上一次修改。' };
  }
}
