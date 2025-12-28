/**
 * 이터널 리턴 실험체 이름 매핑 (영어 ↔ 한글)
 */

export const CHARACTER_NAME_MAP: Record<string, string> = {
  // 영어 → 한글 매핑 (이미지 파일명 → Firestore 이름)
  Abigail: '아비게일',
  Adela: '아델라',
  Adina: '아디나',
  Adriana: '아드리아나',
  Aiden: '에이든',
  Alex: '알렉스',
  Alonso: '알론소',
  Arda: '아르다',
  Aya: '아야',
  Barbara: '바바라',
  bERnice: '버니스',
  Bianca: '비앙카',
  Blair: '블레어',
  Camilo: '카밀로',
  Cathy: '캐시',
  Celine: '셀린',
  Charlotte: '샬럿',
  Chiara: '키아라',
  Chloe: '클로에',
  Daniel: '다니엘',
  Darko: '다르코',
  DebiMarlene: '데비&마를렌',
  Echion: '에키온',
  Elena: '엘레나',
  Eleven: '일레븐',
  Emma: '엠마',
  Estelle: '에스텔',
  Eva: '이바',
  Felix: '펠릭스',
  Fiora: '피오라',
  Garnet: '가넷',
  Hart: '하트',
  Haze: '헤이즈',
  Hisui: '히스이',
  Hyejin: '혜진',
  Hyunwoo: '현우',
  Irem: '이렘',
  Isaac: '아이작',
  Isol: '아이솔',
  Istvan: '이슈트반',
  Jackie: '재키',
  Jan: '얀',
  Jenny: '제니',
  Johann: '요한',
  Justina: '유스티나',
  Karla: '칼라',
  Katja: '카티야',
  Kenneth: '케네스',
  Laura: '라우라',
  Leni: '레니',
  Lenore: '르노어',
  Lenox: '레녹스',
  Leon: '레온',
  LiDailin: '리 다이린',
  Luke: '루크',
  Lyanh: '이안',
  Mai: '마이',
  Markus: '마커스',
  Martina: '마르티나',
  Mirka: '미르카',
  Nadine: '나딘',
  Nathapon: '나타폰',
  Nia: '니아',
  Nicky: '니키',
  Piolo: '피올로',
  Priya: '프리야',
  Rio: '리오',
  Rozzi: '로지',
  Shou: '쇼우',
  Shoichi: '쇼이치',
  Silvia: '실비아',
  Sissela: '시셀라',
  Sua: '수아',
  Tazia: '타지아',
  Theodore: '테오도르',
  Tia: '띠아',
  Tsubame: '츠바메',
  Vanya: '바냐',
  William: '윌리엄',
  Xiukai: '슈린',
  Yuki: '유키',
  Yumin: '유민',
  Zahir: '자히르',
  // 추가된 캐릭터
  Henry: '헨리',
  Magnus: '매그너스',
};

/**
 * 이미지가 없는 캐릭터 목록 - 현재 모든 캐릭터 이미지 있음
 */
export const MISSING_IMAGE_CHARACTERS: readonly { english: string; korean: string }[] = [];

// 한글 → 영어 역매핑
export const CHARACTER_NAME_MAP_KR_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(CHARACTER_NAME_MAP).map(([en, kr]) => [kr, en])
);

/**
 * 영어 이름으로 이미지 경로 반환
 */
export function getCharacterImagePath(englishName: string): string {
  return `/images/characters/${englishName}.png`;
}

/**
 * 한글 이름으로 이미지 경로 반환
 */
export function getCharacterImagePathByKorean(koreanName: string): string | null {
  const englishName = CHARACTER_NAME_MAP_KR_TO_EN[koreanName];
  if (!englishName) return null;
  return `/images/characters/${englishName}.png`;
}
