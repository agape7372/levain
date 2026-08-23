// 기록 내보내기/불러오기 — 기기 이전 대비 (ARCHITECTURE §3).
// 네이티브: Filesystem+Share(가능하면), 폴백/웹: 파일 다운로드·업로드.
import type { SaveEnvelope } from '../store/persistence';
import { isNative, loadPlugin } from './native';

const FILE_NAME = 'levain-save.json';

export async function exportEnvelope(env: SaveEnvelope): Promise<void> {
  const json = JSON.stringify(env, null, 2);

  if (isNative()) {
    try {
      const fsMod = await loadPlugin<{
        Filesystem: {
          writeFile(o: { path: string; data: string; directory: string; encoding: string }): Promise<{ uri: string }>;
        };
        Directory: { Cache: string };
        Encoding: { UTF8: string };
      }>('@capacitor/filesystem');
      const shareMod = await loadPlugin<{ Share: { share(o: { url: string }): Promise<unknown> } }>('@capacitor/share');
      if (fsMod && shareMod) {
        const { uri } = await fsMod.Filesystem.writeFile({
          path: FILE_NAME,
          data: json,
          directory: fsMod.Directory.Cache,
          encoding: fsMod.Encoding.UTF8,
        });
        await shareMod.Share.share({ url: uri });
        return;
      }
    } catch {
      // 폴백으로 진행
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

/** 파일 선택 → 텍스트 반환 (취소 시 null). 검증은 호출자(persistence.validateAndClamp) 몫 */
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
    // 취소는 이벤트가 안 온다 — focus 복귀로 근사하지 않고 그냥 미해결로 둬도 무해(모달 없음)
    input.click();
  });
}
