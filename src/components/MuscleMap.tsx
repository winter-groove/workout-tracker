// 이 파일의 인체 폴리곤 좌표(FRONT_GROUPS/BACK_GROUPS의 svgPoints)는 다음 오픈소스에서 벤더링했습니다:
//   react-body-highlighter — https://github.com/giavinh79/react-body-highlighter
//   Copyright (c) 2020 GV79
//   License: MIT — https://github.com/giavinh79/react-body-highlighter/blob/main/LICENSE
// 좌표·viewBox(0 0 1000 2000)는 원본 그대로 사용하고, 스타일과 근육 id 매핑만 이 프로젝트에 맞게 변경했습니다.

import type { BodyPart } from '../types';
import { BODYPART_REGIONS, MUSCLE_REGIONS, REGION_KO, type MuscleRegion } from '../data/muscle-regions';

/** 벤더 데이터 한 항목: 우리 영역 id로 개명한 근육(또는 윤곽 전용이면 null) + 폴리곤 좌표들. */
interface VendorGroup {
  region: MuscleRegion | null; // null = 하이라이트 대상 아님(윤곽만 표시)
  svgPoints: string[];
}

/**
 * 벤더(react-body-highlighter) 근육 키 → 우리 MuscleRegion id 매핑
 *
 * HEAD / NECK / KNEES / LEFT_SOLEUS / RIGHT_SOLEUS 는 우리 어휘(MUSCLE_REGIONS)에 없는 비근육·미세분류
 * 영역이라 region: null 로 두고 윤곽(기본 스타일)만 그립니다 — 하이라이트 대상에서 제외.
 * ADDUCTOR(내전근)는 벤더 데이터상 후면(posterior)에만, ABDUCTORS(외전근)는 전면(anterior)에만 존재합니다.
 */
const FRONT_GROUPS: VendorGroup[] = [
  {
    region: 'chest',
    svgPoints: ['518 416 510 551 580 580 678 555 706 473 620 416', '298 465 314 555 408 580 482 551 478 420 376 420'],
  },
  {
    region: 'obliques',
    svgPoints: [
      '686 633 673 571 588 596 600 641 604 833 657 788 665 698',
      '339 784 331 718 310 633 322 571 408 592 392 633 392 837',
    ],
  },
  {
    region: 'abs',
    svgPoints: [
      '563 592 580 641 584 780 584 927 563 984 551 1041 514 1078 510 845 506 673 510 571',
      '437 588 486 571 490 673 486 845 482 1073 445 1037 408 914 408 784 412 645',
    ],
  },
  {
    region: 'biceps',
    svgPoints: ['167 682 180 714 229 661 290 539 278 494 204 559', '714 494 702 547 763 661 816 718 829 690 788 555'],
  },
  {
    region: 'triceps',
    svgPoints: ['694 555 694 616 759 727 776 702 755 673', '224 694 298 555 298 608 229 731'],
  },
  {
    region: null, // NECK
    svgPoints: [
      '555 237 506 335 506 392 616 400 706 449 694 367 633 351 584 306',
      '290 449 302 371 363 351 412 302 445 245 490 339 486 392 380 396',
    ],
  },
  {
    region: 'front-deltoids',
    svgPoints: [
      '784 531 796 478 792 412 759 380 710 363 722 429 714 473',
      '282 473 212 531 200 478 204 408 245 371 286 371 269 433',
    ],
  },
  {
    region: null, // HEAD
    svgPoints: ['424 29 400 118 420 196 461 233 498 253 547 224 576 192 592 102 571 24 498 0'],
  },
  {
    region: 'abductors',
    svgPoints: [
      '527 1102 543 1249 600 1102 620 1000 649 943 600 927 567 1045',
      '478 1106 449 1253 420 1159 404 1131 396 1073 380 1024 347 939 396 922 416 992 437 1053',
    ],
  },
  {
    region: 'quadriceps',
    svgPoints: [
      '347 988 371 1082 371 1278 343 1371 310 1327 294 1200 282 1114 294 1008 322 947',
      '633 1057 645 1000 669 947 702 1012 710 1118 682 1331 653 1376 624 1286 620 1114',
      '388 1294 384 1122 412 1184 445 1294 429 1351 400 1461 363 1465 355 1400',
      '596 1457 555 1290 608 1139 612 1302 641 1396 629 1465',
      '327 1384 265 1457 257 1367 257 1273 269 1143 294 1335',
      '718 1131 739 1241 739 1404 727 1457 665 1384 702 1335',
    ],
  },
  {
    region: null, // KNEES
    svgPoints: [
      '339 1400 347 1433 355 1473 363 1510 351 1567 298 1567 273 1527 273 1473 302 1441',
      '657 1400 722 1478 722 1522 698 1571 649 1567 629 1510',
    ],
  },
  {
    region: 'calves',
    svgPoints: [
      '714 1604 735 1535 767 1612 796 1678 784 1878 796 1955 747 1955',
      '249 1947 278 1649 282 1604 261 1543 249 1576 224 1616 208 1678 220 1882 208 1955',
      '727 1951 698 1592 653 1584 641 1624 641 1653 657 1771',
      '355 1584 359 1624 359 1669 351 1722 351 1767 322 1820 306 1873 269 1947 273 1878 282 1804 286 1755 290 1698 298 1641 302 1588',
    ],
  },
  {
    region: 'forearm',
    svgPoints: [
      '61 886 102 751 147 702 163 743 192 735 45 976 0 1000',
      '845 698 833 735 800 731 951 984 1000 1004 935 894 898 763',
      '776 722 776 776 804 841 853 898 922 1012 947 996',
      '69 1012 135 906 188 841 216 771 212 718 49 988',
    ],
  },
];

const BACK_GROUPS: VendorGroup[] = [
  {
    region: null, // HEAD
    svgPoints: ['506 0 460 9 409 55 404 128 451 200 557 200 591 136 596 47 557 13'],
  },
  {
    region: 'trapezius',
    svgPoints: [
      '447 217 477 217 472 383 477 647 383 532 353 409 311 366 391 332 438 272',
      '523 217 557 217 566 272 609 328 689 366 647 404 617 532 523 647 532 383',
    ],
  },
  {
    region: 'back-deltoids',
    svgPoints: ['294 370 230 391 174 443 183 536 243 494 272 464', '711 370 783 396 826 447 817 536 749 489 723 451'],
  },
  {
    region: 'upper-back',
    svgPoints: [
      '311 387 281 489 285 553 340 753 472 711 472 664 366 540 336 413',
      '689 387 719 494 715 562 660 753 528 711 528 664 634 545 664 417',
    ],
  },
  {
    region: 'triceps',
    svgPoints: [
      '268 498 179 557 145 723 166 817 217 638 268 557',
      '736 502 821 557 860 732 834 821 779 630 732 557',
      '268 583 268 685 230 753 191 774 226 655',
      '728 583 770 647 804 774 766 753 728 689',
    ],
  },
  {
    region: 'lower-back',
    svgPoints: ['477 728 345 770 353 834 494 1021 468 830', '523 728 655 770 647 834 506 1021 532 838'],
  },
  {
    region: 'forearm',
    svgPoints: [
      '864 757 911 834 932 940 1000 1064 962 1043 881 894 843 838',
      '136 757 89 838 68 936 0 1064 38 1043 123 885 157 830',
      '813 796 774 779 791 847 911 1038 932 1089 945 1047',
      '187 796 221 779 209 843 94 1030 68 1085 51 1047',
    ],
  },
  {
    region: 'gluteal',
    svgPoints: [
      '447 996 302 1085 298 1187 315 1260 472 1213 494 1149',
      '553 991 511 1145 523 1209 681 1260 698 1191 694 1085',
    ],
  },
  {
    region: 'adductor',
    svgPoints: [
      '481 1230 447 1230 413 1255 451 1443 485 1357 489 1294',
      '519 1226 557 1234 591 1260 549 1443 519 1362 511 1294',
    ],
  },
  {
    region: 'hamstring',
    svgPoints: [
      '289 1221 311 1294 366 1260 353 1353 345 1502 294 1583 289 1468 277 1413 272 1315',
      '715 1217 694 1289 638 1260 655 1366 664 1502 711 1583 715 1477 728 1421 736 1319',
      '387 1255 443 1460 404 1668 362 1528 370 1353',
      '617 1255 634 1362 643 1532 600 1668 562 1464',
    ],
  },
  {
    region: null, // KNEES
    svgPoints: ['345 1532 311 1591 336 1664 374 1626', '664 1536 630 1630 668 1664 694 1591'],
  },
  {
    region: 'calves',
    svgPoints: [
      '294 1604 285 1672 247 1796 238 1928 255 1970 285 1932 298 1800 319 1711 319 1668',
      '374 1651 353 1677 332 1719 311 1804 302 1919 340 2000 387 1906 391 1689',
      '630 1651 613 1685 617 1906 664 1996 706 1919 689 1796 668 1702',
      '706 1604 723 1685 757 1791 766 1928 745 1966 723 1936 706 1796 681 1681',
    ],
  },
  {
    region: null, // LEFT_SOLEUS
    svgPoints: ['285 1957 302 1957 336 2017 306 2200 285 2136 268 1983'],
  },
  {
    region: null, // RIGHT_SOLEUS
    svgPoints: ['698 1957 719 1957 736 1983 719 2132 702 2196 672 2021'],
  },
];

/** MuscleRegion 중 전면(anterior) 뷰에 존재하는 것들 — 뷰 선택에 사용. */
const FRONT_REGION_IDS = new Set(
  FRONT_GROUPS.map((g) => g.region).filter((r): r is MuscleRegion => r !== null)
);

const VALID_REGIONS = new Set<string>(MUSCLE_REGIONS);

const BASE_STYLE = { fill: 'var(--surface-2)', stroke: 'var(--border)', strokeWidth: 1.5 } as const;

export default function MuscleMap({ muscles, bodyPart }: { muscles?: string[]; bodyPart: BodyPart }) {
  const rawHighlights = (muscles ?? []).filter((m): m is MuscleRegion => VALID_REGIONS.has(m));
  const highlights = rawHighlights.length > 0 ? rawHighlights : (BODYPART_REGIONS[bodyPart] ?? []);

  const primary = highlights[0];
  const view: 'front' | 'back' = primary && FRONT_REGION_IDS.has(primary) ? 'front' : 'back';
  const groups = view === 'front' ? FRONT_GROUPS : BACK_GROUPS;

  // 렌더되는 뷰의 데이터에 실제로 존재하는 영역만 하이라이트 후보로 남긴다.
  const viewRegionIds = new Set(groups.map((g) => g.region).filter((r): r is MuscleRegion => r !== null));
  const visibleHighlights = highlights.filter((r) => viewRegionIds.has(r));
  const secondarySet = new Set(visibleHighlights.slice(1));

  function classNameFor(region: MuscleRegion | null): string | undefined {
    if (region === null) return undefined;
    if (region === visibleHighlights[0]) return 'mm-primary';
    if (secondarySet.has(region)) return 'mm-secondary';
    return undefined;
  }

  const ariaLabel = primary ? `자극 부위: ${REGION_KO[primary]}` : '자극 부위 정보 없음';

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      data-view={view}
      width="100%"
      height="100%"
      viewBox="0 0 1000 2000"
      preserveAspectRatio="xMidYMid meet"
    >
      {groups.map((group, groupIndex) =>
        group.svgPoints.map((points, i) => {
          const cls = classNameFor(group.region);
          return (
            <polygon
              key={`${groupIndex}-${i}`}
              points={points}
              className={cls}
              style={cls ? undefined : BASE_STYLE}
            />
          );
        })
      )}
    </svg>
  );
}
