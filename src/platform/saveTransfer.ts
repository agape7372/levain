// 기록 내보내기/불러오기 — 기기 이전 대비 (ARCHITECTURE §3).
// 네이티브: Filesystem+Share, 웹: 파일 다운로드·업로드.
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { SaveEnvelope } from '../store/persistence';
import { isNative } from './native';

const FILE_NAME = 'levain-save.json';

export async function exportEnvelope(env: SaveEnvelope): Promise<void> {
  const json = JSON.stringify(env, null, 2);

  if (isNative()) {
    try {
      const { uri } = await Filesystem.writeFile({
        path: FILE_NAME,
        data: json,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ url: uri });
      return;
    } catch {
      // 공유 시트 취소 포함 — 웹 다운로드 폴백으로 진행하지 않고 조용히 끝낸다
      return;
    }
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILE_NAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 파일 선택 → 텍스트 반환 (취소 시 미해결로 남을 수 있음 — 호출부는 모달 없이 대기). 검증은 persistence 몫 */
export function pickImportFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(f);
    });
    input.click();
  });
}
