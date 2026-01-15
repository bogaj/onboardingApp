import type {
  ClipboardEvent,
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
} from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { marked } from 'marked'
import './App.css'

marked.use({ mangle: false, headerIds: false } as unknown as object)

const RICH_TEXT_COLORS = [
  { label: 'Czarny', value: '#000000' },
  { label: 'Niebieski', value: '#2f6fe0' },
  { label: 'Czerwony', value: '#d64545' },
  { label: 'Zielony', value: '#2f8f4f' },
  { label: 'Zolty', value: '#e2a22b' },
]

const LINK_COLOR = '#1a5fd0'
const ASSET_KIND_LABELS: Record<'image' | 'video' | 'file', string> = {
  image: 'Obraz',
  video: 'Wideo',
  file: 'Plik',
}
const MAX_LESSON_VERSIONS = 3

const DEFAULT_RICH_TOOLBAR_STATE: RichToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  unorderedList: false,
  orderedList: false,
  blockquote: false,
  link: false,
  align: null,
  heading: null,
}

const normalizeLinkUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

type ColumnSpan = 1 | 2 | 4

type ImageItem = {
  src: string
  alt: string
  caption?: string
  name?: string
  size?: number
}

type ContentComponent =
  | {
      id: string
      type: 'text'
      span: ColumnSpan
      markdown: string
    }
  | {
      id: string
      type: 'video'
      span: ColumnSpan
      title: string
      description?: string
      embedUrl?: string
      assetId?: string
      assetName?: string
      assetSize?: number
    }
  | {
      id: string
      type: 'image'
      span: ColumnSpan
      images: ImageItem[]
    }

type DownloadComponent = {
  id: string
  type: 'download'
  span: ColumnSpan
  label: string
  files: DownloadFile[]
}

type TestOption = {
  id: string
  text: string
  isCorrect: boolean
}

type QuestionRow = {
  id: string
  columns: ContentComponent[]
}

type TestQuestion = {
  id: string
  prompt: string
  rows: QuestionRow[]
  options: TestOption[]
}

type TestComponent = {
  id: string
  type: 'test'
  span: ColumnSpan
  title: string
  questions: TestQuestion[]
}

type LessonComponent = ContentComponent | DownloadComponent | TestComponent

type LessonRow = {
  id: string
  columns: LessonComponent[]
}

type Lesson = {
  id: string
  number: number
  title: string
  duration: string
  difficulty: string
  summary: string
  rows: LessonRow[]
}

type LessonSnapshot = {
  savedAt: string
  lesson: Lesson
}

type LessonStats = {
  rows: number
  components: number
  byType: Record<LessonComponent['type'], number>
  questions: number
}

type Topic = {
  id: string
  title: string
  description: string
  lessons: Lesson[]
}

type LessonExportBundle = {
  version: number
  exportedAt: string
  topic: { title: string; description?: string }
  lesson: Lesson
}

type LightboxImage = ImageItem

type DownloadFile =
  | { kind: 'text'; name: string; content: string }
  | { kind: 'asset'; id: string; name: string; size?: number }

type TestProgress = {
  questionOrder: string[]
  optionOrder: Record<string, string[]>
  currentIndex: number
  answers: Record<string, string[]>
}

type TestResult = {
  completedAt: string
  score: number
  total: number
}

type AssetFile = { id: string; name: string; size?: number }
type ImageAssetForm = AssetFile & { alt: string; caption: string }
type AssetLibraryKind = 'image' | 'video' | 'file'
type AssetLibraryItem = AssetFile & { kind: AssetLibraryKind; addedAt: string }

type FileFilter = { name: string; extensions: string[] }

type ElectronSaveFilePayload = {
  defaultPath: string
  data: Uint8Array
  filters?: FileFilter[]
}

type ElectronSaveFileResult = {
  saved: boolean
  path?: string
}

type LessonExportPayload = {
  folderName: string
  data: Uint8Array
}

type LessonExportResult = {
  saved: boolean
  path?: string
}

type LessonImportResult = {
  name: string
  data: Uint8Array
} | null

type WriteAssetPayload = {
  data: Uint8Array
}

type WriteAssetResult = {
  id: string
  size: number
}

type ElectronAPI = {
  saveFile: (payload: ElectronSaveFilePayload) => Promise<ElectronSaveFileResult>
  pickFiles: (options?: { filters?: FileFilter[] }) => Promise<AssetFile[]>
  readAsset: (assetId: string) => Promise<Uint8Array | null>
  openExternal: (url: string) => Promise<boolean>
  saveLessonExport: (payload: LessonExportPayload) => Promise<LessonExportResult>
  openLessonExport: () => Promise<LessonImportResult>
  writeAsset: (payload: WriteAssetPayload) => Promise<WriteAssetResult>
}

type RichToolbarState = {
  bold: boolean
  italic: boolean
  underline: boolean
  unorderedList: boolean
  orderedList: boolean
  blockquote: boolean
  link: boolean
  align: 'left' | 'center' | 'right' | null
  heading: 'p' | 'h1' | 'h2' | 'h3' | null
}

type TeacherModal =
  | { type: 'add-topic' }
  | { type: 'edit-topic'; topicId: string }
  | { type: 'add-lesson' }
  | { type: 'edit-lesson'; lessonId: string }
  | { type: 'add-component'; lessonId: string }
  | { type: 'edit-component'; lessonId: string; componentId: string }

type TopicFormState = {
  title: string
  description: string
}

type LessonFormState = {
  topicId: string
  number: number
  title: string
  duration: string
  difficulty: string
  summary: string
}

type ContentComponentFormState = {
  type: ContentComponent['type']
  span: ColumnSpan
  markdown: string
  title: string
  description: string
  embedUrl: string
  imagesText: string
  imageAssets: ImageAssetForm[]
  videoAsset: AssetFile | null
}

type ComponentFormState = {
  type: LessonComponent['type']
  span: ColumnSpan
  markdown: string
  title: string
  description: string
  embedUrl: string
  imagesText: string
  downloadLabel: string
  filesText: string
  assetFiles: AssetFile[]
  imageAssets: ImageAssetForm[]
  videoAsset: AssetFile | null
  testTitle: string
  testQuestions: TestQuestion[]
}

const seedTopics: Topic[] = [
  {
    id: 'b2b',
    title: 'B2B Tester',
    description: 'Pierwsze loty w środowisku biznesowym i proces testów.',
    lessons: [
      {
        id: 'b2b-1',
        number: 1,
        title: 'Start misji i narzędzia',
        duration: '25 min',
        difficulty: 'Podstawy',
        summary:
          'Poznaj środowisko, repozytoria i checklisty potrzebne do pierwszych testów.',
        rows: [
          {
            id: 'b2b-1-r1',
            columns: [
              {
                id: 'b2b-1-c1',
                type: 'text',
                span: 4,
                markdown: `### Witaj na pokładzie
W tej lekcji przeprowadzimy Cię przez podstawy pracy testera w modelu B2B.

**Cel misji:** przygotować środowisko, zrozumieć przepływ danych i uruchomić checklistę startową.`,
              },
            ],
          },
          {
            id: 'b2b-1-r2',
            columns: [
              {
                id: 'b2b-1-c2',
                type: 'image',
                span: 2,
                images: [
                  {
                    src: '/mission-briefing.svg',
                    alt: 'Briefing misji',
                    caption: 'Briefing misji',
                  },
                  {
                    src: '/system-map.svg',
                    alt: 'Mapa systemu',
                    caption: 'Mapa systemu',
                  },
                ],
              },
              {
                id: 'b2b-1-c3',
                type: 'text',
                span: 2,
                markdown: `### Co sprawdzamy?
- dostęp do repozytoriów
- konfigurację środowiska testowego
- checklistę startową i logi`,
              },
            ],
          },
          {
            id: 'b2b-1-r3',
            columns: [
              {
                id: 'b2b-1-c4',
                type: 'video',
                span: 4,
                title: 'Briefing wideo: pierwsze 10 minut',
                description:
                  'Zobacz krótki briefing pokazujący, jak przygotować pierwszą sesję testową.',
                embedUrl: 'https://www.youtube.com/embed/ysz5S6PUM-U',
              },
            ],
          },
          {
            id: 'b2b-1-r4',
            columns: [
              {
                id: 'b2b-1-c5',
                type: 'download',
                span: 4,
                label: 'Pobierz materiały do startu',
                files: [
                  {
                    kind: 'text',
                    name: 'Checklist_Startowa.txt',
                    content:
                      '1. Sprawdź dostęp do repo.\n2. Uruchom środowisko.\n3. Wykonaj test logowania.',
                  },
                  {
                    kind: 'text',
                    name: 'Mapa_Systemu.txt',
                    content:
                      'Mapa systemu: wewnętrzne moduły, API, kolejki, monitoring.',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'b2b-2',
        number: 2,
        title: 'Scenariusze testów end-to-end',
        duration: '30 min',
        difficulty: 'Średnio zaawansowane',
        summary:
          'Zbuduj pierwsze scenariusze testów i naucz się śledzić przepływ zdarzeń.',
        rows: [
          {
            id: 'b2b-2-r1',
            columns: [
              {
                id: 'b2b-2-c1',
                type: 'text',
                span: 4,
                markdown: `### Scenariusze E2E
Tworzymy scenariusze obejmujące cały proces. Skup się na punktach krytycznych i danych wejściowych.

**Wskazówka:** dokumentuj założenia i od razu zapisuj wyniki w logach.`,
              },
            ],
          },
          {
            id: 'b2b-2-r2',
            columns: [
              {
                id: 'b2b-2-c2',
                type: 'image',
                span: 2,
                images: [
                  {
                    src: '/checklist.svg',
                    alt: 'Checklisty procesu',
                    caption: 'Checklisty procesu',
                  },
                ],
              },
              {
                id: 'b2b-2-c3',
                type: 'text',
                span: 2,
                markdown: `### Punkty krytyczne
- logowanie i autoryzacja
- weryfikacja danych kontrahenta
- finalizacja transakcji`,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'ceke',
    title: 'CEKE',
    description: 'Standardy bezpieczeństwa i procedury zgodności.',
    lessons: [
      {
        id: 'ceke-1',
        number: 1,
        title: 'Bezpieczne logowanie',
        duration: '20 min',
        difficulty: 'Podstawy',
        summary:
          'Poznaj polityki haseł, segmentację dostępu i sposób raportowania.',
        rows: [
          {
            id: 'ceke-1-r1',
            columns: [
              {
                id: 'ceke-1-c1',
                type: 'text',
                span: 4,
                markdown: `### Procedury dostępu
Bezpieczne logowanie to fundament. Sprawdź, jak wygląda standard w TopGun Academy.

**Zadanie:** zweryfikuj 3 przykłady niepoprawnych prób logowania.`,
              },
            ],
          },
          {
            id: 'ceke-1-r2',
            columns: [
              {
                id: 'ceke-1-c2',
                type: 'image',
                span: 4,
                images: [
                  {
                    src: '/secure-access.svg',
                    alt: 'Schemat dostępu',
                    caption: 'Schemat dostępu',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'ceke-2',
        number: 2,
        title: 'Monitoring i raporty',
        duration: '35 min',
        difficulty: 'Średnio zaawansowane',
        summary:
          'Poznaj zestaw raportów, alerty i mechanizmy eskalacji incydentów.',
        rows: [
          {
            id: 'ceke-2-r1',
            columns: [
              {
                id: 'ceke-2-c1',
                type: 'text',
                span: 4,
                markdown: `### Raporty bezpieczeństwa
W ciągu dnia monitorujemy alerty, a pod koniec zmiany tworzymy raport zbiorczy.

#### Co raportujemy?
- anomalie logowania
- przekroczenia limitów
- nietypowe wzorce transakcji`,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'psd2',
    title: 'PSD2',
    description: 'Przepisy i praktyka w testach płatności.',
    lessons: [
      {
        id: 'psd2-1',
        number: 1,
        title: 'Krytyczne punkty płatności',
        duration: '40 min',
        difficulty: 'Zaawansowane',
        summary:
          'Analiza procesu płatności pod kątem ryzyk i wymagań PSD2.',
        rows: [
          {
            id: 'psd2-1-r1',
            columns: [
              {
                id: 'psd2-1-c1',
                type: 'text',
                span: 4,
                markdown: `### Autoryzacja i SCA
Silne uwierzytelnianie klienta (SCA) musi być testowane na każdym etapie.

**Twoja misja:** zweryfikuj wszystkie punkty wywołania SCA.`,
              },
            ],
          },
          {
            id: 'psd2-1-r2',
            columns: [
              {
                id: 'psd2-1-c2',
                type: 'download',
                span: 4,
                label: 'Pobierz checklistę SCA',
                files: [
                  {
                    kind: 'text',
                    name: 'Checklist_SCA.txt',
                    content:
                      '1. Weryfikacja kanałów SCA.\n2. Sprawdź timeouty.\n3. Test awaryjny.',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'psd2-2',
        number: 2,
        title: 'Mapowanie ryzyk',
        duration: '30 min',
        difficulty: 'Średnio zaawansowane',
        summary:
          'Ustal ryzyka operacyjne i poznaj priorytety testów regresyjnych.',
        rows: [
          {
            id: 'psd2-2-r1',
            columns: [
              {
                id: 'psd2-2-c1',
                type: 'text',
                span: 4,
                markdown: `### Macierz ryzyk
Priorytetyzujemy scenariusze według wpływu i prawdopodobieństwa.

**Tip:** nie zawsze najbardziej złożony scenariusz ma najwyższy priorytet.`,
              },
            ],
          },
        ],
      },
    ],
  },
]

const polishMap: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ż: 'z',
  ź: 'z',
  Ą: 'a',
  Ć: 'c',
  Ę: 'e',
  Ł: 'l',
  Ń: 'n',
  Ó: 'o',
  Ś: 's',
  Ż: 'z',
  Ź: 'z',
}

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const normalizeText = (value: string) =>
  value
    .split('')
    .map((char) => polishMap[char] ?? char)
    .join('')
    .toLowerCase()

const slugify = (value: string) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const isDefined = <T,>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined

const createId = (prefix: string) => {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${suffix}`
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

const rowSpanUsed = (row: { columns: Array<{ span: ColumnSpan }> }) =>
  row.columns.reduce((sum, column) => sum + column.span, 0)

const createTestOption = (): TestOption => ({
  id: createId('opt'),
  text: '',
  isCorrect: false,
})

const createTestQuestion = (): TestQuestion => ({
  id: createId('question'),
  prompt: 'Nowe pytanie',
  rows: [
    {
      id: createId('qrow'),
      columns: [
        {
          id: createId('qcmp'),
          type: 'text',
          span: 4,
          markdown: 'Dodaj tresc pytania.',
        },
      ],
    },
  ],
  options: [
    { ...createTestOption(), isCorrect: true, text: 'Odpowiedz A' },
    { ...createTestOption(), text: 'Odpowiedz B' },
    { ...createTestOption(), text: 'Odpowiedz C' },
    { ...createTestOption(), text: 'Odpowiedz D' },
  ],
})

const ensureOptionCount = (options: TestOption[], count: number) => {
  const next = [...options]
  while (next.length < count) {
    next.push(createTestOption())
  }
  return next.slice(0, count)
}

const createEmptyContentForm = (): ContentComponentFormState => ({
  type: 'text',
  span: 4,
  markdown: '### Nowy blok\nUzupełnij treść.',
  title: '',
  description: '',
  embedUrl: '',
  imagesText: '',
  imageAssets: [],
  videoAsset: null,
})

const validateTestQuestions = (questions: TestQuestion[]) => {
  if (!questions.length) {
    return 'Dodaj przynajmniej jedno pytanie.'
  }
  for (const question of questions) {
    if (!question.prompt.trim()) {
      return 'Uzupelnij tresc pytania.'
    }
    if (question.options.length < 2) {
      return 'Kazde pytanie musi miec co najmniej 2 odpowiedzi.'
    }
    if (!question.options.some((option) => option.isCorrect)) {
      return 'Kazde pytanie musi miec przynajmniej jedna poprawna odpowiedz.'
    }
    if (question.options.some((option) => !option.text.trim())) {
      return 'Uzupelnij tresc odpowiedzi w pytaniach.'
    }
  }
  return null
}

const buildTestProgress = (test: TestComponent): TestProgress => {
  const questionOrder = shuffleArray(test.questions.map((question) => question.id))
  const optionOrder: Record<string, string[]> = {}
  test.questions.forEach((question) => {
    optionOrder[question.id] = shuffleArray(
      question.options.map((option) => option.id),
    )
  })
  return {
    questionOrder,
    optionOrder,
    currentIndex: 0,
    answers: {},
  }
}

const calculateTestScore = (
  test: TestComponent,
  answers: Record<string, string[]>,
) => {
  let score = 0
  test.questions.forEach((question) => {
    const correctIds = question.options
      .filter((option) => option.isCorrect)
      .map((option) => option.id)
      .sort()
    const selected = [...(answers[question.id] ?? [])].sort()
    const isCorrect =
      correctIds.length === selected.length &&
      correctIds.every((id, index) => id === selected[index])
    if (isCorrect) {
      score += 1
    }
  })
  return score
}

const shuffleArray = <T,>(items: T[]) => {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const addComponentToRows = (
  rows: LessonRow[],
  component: LessonComponent,
) => {
  if (!rows.length) {
    return [
      {
        id: createId('row'),
        columns: [component],
      },
    ]
  }
  const lastRow = rows[rows.length - 1]
  const used = rowSpanUsed(lastRow)
  if (used + component.span > 4) {
    return [
      ...rows,
      {
        id: createId('row'),
        columns: [component],
      },
    ]
  }
  return [
    ...rows.slice(0, -1),
    {
      ...lastRow,
      columns: [...lastRow.columns, component],
    },
  ]
}

const removeComponentFromRows = (
  rows: LessonRow[],
  componentId: string,
) =>
  rows
    .map((row) => ({
      ...row,
      columns: row.columns.filter((column) => column.id !== componentId),
    }))
    .filter((row) => row.columns.length > 0)

const updateComponentInRows = (
  rows: LessonRow[],
  componentId: string,
  nextComponent: LessonComponent,
) =>
  rows.map((row) => ({
    ...row,
    columns: row.columns.map((column) =>
      column.id === componentId ? nextComponent : column,
    ),
  }))

const addComponentToQuestionRows = (
  rows: QuestionRow[],
  component: ContentComponent,
) => {
  if (!rows.length) {
    return [
      {
        id: createId('qrow'),
        columns: [component],
      },
    ]
  }
  const lastRow = rows[rows.length - 1]
  const used = rowSpanUsed(lastRow)
  if (used + component.span > 4) {
    return [
      ...rows,
      {
        id: createId('qrow'),
        columns: [component],
      },
    ]
  }
  return [
    ...rows.slice(0, -1),
    {
      ...lastRow,
      columns: [...lastRow.columns, component],
    },
  ]
}

const removeQuestionComponentFromRows = (
  rows: QuestionRow[],
  componentId: string,
) =>
  rows
    .map((row) => ({
      ...row,
      columns: row.columns.filter((column) => column.id !== componentId),
    }))
    .filter((row) => row.columns.length > 0)

const updateQuestionComponentInRows = (
  rows: QuestionRow[],
  componentId: string,
  nextComponent: ContentComponent,
) =>
  rows.map((row) => ({
    ...row,
    columns: row.columns.map((column) =>
      column.id === componentId ? nextComponent : column,
    ),
  }))

const parsePipeLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const parseImageLines = (value: string) =>
  parsePipeLines(value)
    .map((line): ImageItem | null => {
      const [src, alt, caption] = line.split('|').map((part) => part.trim())
      if (!src) {
        return null
      }
      const image: ImageItem = {
        src,
        alt: alt || 'Obraz',
      }
      if (caption) {
        image.caption = caption
      }
      return image
    })
    .filter(isDefined)

const formatImageLines = (images: ImageItem[]) =>
  images
    .filter((image) => !image.src.startsWith('asset:'))
    .map((image) =>
      [image.src, image.alt, image.caption].filter(Boolean).join(' | '),
    )
    .join('\n')

const parseTextFileLines = (value: string) =>
  parsePipeLines(value)
    .map((line): DownloadFile | null => {
      const [name, content] = line.split('|').map((part) => part.trim())
      if (!name) {
        return null
      }
      return {
        kind: 'text' as const,
        name,
        content: content || '',
      }
    })
    .filter(isDefined)

const isTextDownloadFile = (
  file: DownloadFile,
): file is Extract<DownloadFile, { kind: 'text' }> =>
  file.kind === 'text'

const formatTextFileLines = (files: DownloadFile[]) =>
  files
    .filter(isTextDownloadFile)
    .map((file) => [file.name, file.content].filter(Boolean).join(' | '))
    .join('\n')

const formatFileSize = (size?: number) => {
  if (!size) {
    return ''
  }
  if (size < 1024) {
    return `${size} B`
  }
  const kb = size / 1024
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`
  }
  return `${(kb / 1024).toFixed(1)} MB`
}

const cloneLesson = (lesson: Lesson): Lesson =>
  JSON.parse(JSON.stringify(lesson)) as Lesson

const getLessonStats = (lesson: Lesson): LessonStats => {
  const byType: LessonStats['byType'] = {
    text: 0,
    video: 0,
    image: 0,
    download: 0,
    test: 0,
  }
  let components = 0
  let questions = 0
  lesson.rows.forEach((row) => {
    row.columns.forEach((column) => {
      components += 1
      byType[column.type] += 1
      if (column.type === 'test') {
        questions += column.questions.length
      }
    })
  })
  return {
    rows: lesson.rows.length,
    components,
    byType,
    questions,
  }
}

const formatDelta = (value: number) =>
  value > 0 ? `+${value}` : `${value}`

const buildLessonDiffLines = (version: Lesson, current: Lesson) => {
  const lines: string[] = []
  if (version.title !== current.title) {
    lines.push(`Tytuł: ${version.title}`)
  }
  if (version.summary !== current.summary) {
    lines.push('Opis: zmieniony')
  }
  if (version.duration !== current.duration) {
    lines.push(`Czas: ${version.duration}`)
  }
  if (version.difficulty !== current.difficulty) {
    lines.push(`Poziom: ${version.difficulty}`)
  }
  const versionStats = getLessonStats(version)
  const currentStats = getLessonStats(current)
  const deltas: Array<[string, number]> = [
    ['Wiersze', versionStats.rows - currentStats.rows],
    ['Komponenty', versionStats.components - currentStats.components],
    ['Tekst', versionStats.byType.text - currentStats.byType.text],
    ['Wideo', versionStats.byType.video - currentStats.byType.video],
    ['Obraz', versionStats.byType.image - currentStats.byType.image],
    ['Pliki', versionStats.byType.download - currentStats.byType.download],
    ['Testy', versionStats.byType.test - currentStats.byType.test],
    ['Pytania', versionStats.questions - currentStats.questions],
  ]
  deltas.forEach(([label, delta]) => {
    if (delta !== 0) {
      lines.push(`${label}: ${formatDelta(delta)}`)
    }
  })
  return lines.length ? lines : ['Brak różnic względem aktualnej wersji.']
}

const rgbToHex = (value: string) => {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) {
    return null
  }
  const toHex = (part: string) => Number(part).toString(16).padStart(2, '0')
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`
}

const normalizeColor = (value?: string | null) => {
  if (!value) {
    return null
  }
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed === 'transparent') {
    return null
  }
  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
    }
    return trimmed
  }
  if (trimmed.startsWith('rgb')) {
    return rgbToHex(trimmed)
  }
  return null
}

const isAssetSrc = (src: string) => src.startsWith('asset:')

const assetIdFromSrc = (src: string) => src.replace('asset:', '')

const normalizeDownloadFiles = (
  files: Array<DownloadFile | { name: string; content: string }>,
) => {
  let changed = false
  const normalized = files.map((file) => {
    if ('kind' in file) {
      return file
    }
    changed = true
    return {
      kind: 'text',
      name: file.name,
      content: file.content,
    } as DownloadFile
  })
  return { files: normalized as DownloadFile[], changed }
}

const normalizeTopics = (topics: Topic[]) => {
  let changed = false
  const normalized = topics.map((topic) => {
    let topicChanged = false
    const lessons = topic.lessons.map((lesson) => {
      let lessonChanged = false
      const rows = lesson.rows.map((row) => {
        let rowChanged = false
        const columns = row.columns.map((column) => {
          if (column.type !== 'download') {
            return column
          }
          const sourceFiles = Array.isArray(column.files) ? column.files : []
          const { files, changed: filesChanged } = normalizeDownloadFiles(
            sourceFiles as Array<DownloadFile | { name: string; content: string }>,
          )
          if (!filesChanged) {
            return column
          }
          rowChanged = true
          return { ...column, files }
        })
        if (!rowChanged) {
          return row
        }
        lessonChanged = true
        return { ...row, columns }
      })
      if (!lessonChanged) {
        return lesson
      }
      topicChanged = true
      return { ...lesson, rows }
    })
    if (!topicChanged) {
      return topic
    }
    changed = true
    return { ...topic, lessons }
  })
  return { topics: normalized, changed }
}

const sanitizeRichHtml = (html: string) => {
  const container = document.createElement('div')
  container.innerHTML = html

  container.querySelectorAll('script,style,meta,link').forEach((node) => {
    node.remove()
  })

  const allElements = container.querySelectorAll('*')
  allElements.forEach((node) => {
    if (node.tagName.includes(':')) {
      node.remove()
      return
    }
    node.removeAttribute('class')
  })

  return container.innerHTML
}

const useResolvedAssetSrc = (src: string) => {
  const [resolvedSrc, setResolvedSrc] = useState(
    isAssetSrc(src) ? '' : src,
  )

  useEffect(() => {
    if (!isAssetSrc(src)) {
      setResolvedSrc(src)
      return
    }

    let active = true
    let objectUrl = ''
    const electronApi = getElectronApi()
    if (!electronApi?.readAsset) {
      setResolvedSrc('')
      return
    }
    const assetId = assetIdFromSrc(src)
    electronApi.readAsset(assetId).then((data) => {
      if (!active) {
        return
      }
      if (data === null) {
        setResolvedSrc('')
        return
      }
      const safeData = new Uint8Array(data)
      objectUrl = URL.createObjectURL(new Blob([safeData]))
      setResolvedSrc(objectUrl)
    })
    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [src])

  return resolvedSrc
}

const ResolvedImage = ({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) => {
  const resolvedSrc = useResolvedAssetSrc(src)

  if (!resolvedSrc) {
    return (
      <div className={`image-fallback ${className ?? ''}`.trim()}>
        Brak podgladu
      </div>
    )
  }

  return <img src={resolvedSrc} alt={alt} className={className} />
}

const ResolvedVideo = ({
  src,
  title,
}: {
  src: string
  title: string
}) => {
  const resolvedSrc = useResolvedAssetSrc(src)

  if (!resolvedSrc) {
    return <div className="video-placeholder">Brak wideo.</div>
  }

  return <video controls preload="metadata" src={resolvedSrc} title={title} />
}

const createPlaceholderRow = (): LessonRow => ({
  id: createId('row'),
  columns: [
    {
      id: createId('cmp'),
      type: 'text',
      span: 4,
      markdown: '### Nowy blok\nDodaj treść lekcji.',
    },
  ],
})

const createQuestionPlaceholderRow = (): QuestionRow => ({
  id: createId('qrow'),
  columns: [
    {
      id: createId('qcmp'),
      type: 'text',
      span: 4,
      markdown: 'Dodaj tresc pytania.',
    },
  ],
})

const buildContentComponentFromForm = (
  form: ContentComponentFormState,
  existingId?: string,
): ContentComponent => {
  const base = {
    id: existingId ?? createId('qcmp'),
    span: form.span,
  }

  if (form.type === 'text') {
    return {
      ...base,
      type: 'text',
      markdown: form.markdown.trim() || 'Nowy blok',
    }
  }

  if (form.type === 'video') {
    const videoAsset = form.videoAsset
      ? {
          assetId: form.videoAsset.id,
          assetName: form.videoAsset.name,
          assetSize: form.videoAsset.size,
        }
      : {}
    return {
      ...base,
      type: 'video',
      title: form.title.trim() || 'Nowe wideo',
      description: form.description.trim() || undefined,
      embedUrl: form.embedUrl.trim() || undefined,
      ...videoAsset,
    }
  }

  const images = parseImageLines(form.imagesText)
  const assetImages: ImageItem[] = form.imageAssets.map((asset) => ({
    src: `asset:${asset.id}`,
    alt: asset.alt.trim() || asset.name,
    caption: asset.caption.trim() || undefined,
    name: asset.name,
    size: asset.size,
  }))
  return {
    ...base,
    type: 'image',
    images:
      images.length || assetImages.length
        ? [...images, ...assetImages]
        : [
            {
              src: '/system-map.svg',
              alt: 'Obraz',
              caption: 'Dodaj opis',
            },
          ],
  }
}

const buildContentFormFromComponent = (
  component: ContentComponent,
): ContentComponentFormState => {
  if (component.type === 'text') {
    return {
      type: 'text',
      span: component.span,
      markdown: component.markdown,
      title: '',
      description: '',
      embedUrl: '',
      imagesText: '',
      imageAssets: [],
      videoAsset: null,
    }
  }
  if (component.type === 'video') {
    const videoAsset = component.assetId
      ? {
          id: component.assetId,
          name: component.assetName ?? 'Wideo',
          size: component.assetSize,
        }
      : null
    return {
      type: 'video',
      span: component.span,
      markdown: '',
      title: component.title,
      description: component.description ?? '',
      embedUrl: component.embedUrl ?? '',
      imagesText: '',
      imageAssets: [],
      videoAsset,
    }
  }
  const assetImages = component.images
    .filter((image) => isAssetSrc(image.src))
    .map((image) => ({
      id: assetIdFromSrc(image.src),
      name: image.name ?? image.alt,
      size: image.size,
      alt: image.alt,
      caption: image.caption ?? '',
    }))
  const urlImages = component.images.filter((image) => !isAssetSrc(image.src))
  return {
    type: 'image',
    span: component.span,
    markdown: '',
    title: '',
    description: '',
    embedUrl: '',
    imagesText: formatImageLines(urlImages),
    imageAssets: assetImages,
    videoAsset: null,
  }
}

const buildComponentFromForm = (
  form: ComponentFormState,
  existingId?: string,
): LessonComponent => {
  const base = {
    id: existingId ?? createId('cmp'),
    span: form.span,
  }

  if (form.type === 'text') {
    return {
      ...base,
      type: 'text',
      markdown: form.markdown.trim() || '### Nowy blok',
    }
  }

  if (form.type === 'video') {
    const videoAsset = form.videoAsset
      ? {
          assetId: form.videoAsset.id,
          assetName: form.videoAsset.name,
          assetSize: form.videoAsset.size,
        }
      : {}
    return {
      ...base,
      type: 'video',
      title: form.title.trim() || 'Nowe wideo',
      description: form.description.trim() || undefined,
      embedUrl: form.embedUrl.trim() || undefined,
      ...videoAsset,
    }
  }

  if (form.type === 'image') {
    const images = parseImageLines(form.imagesText)
    const assetImages: ImageItem[] = form.imageAssets.map((asset) => ({
      src: `asset:${asset.id}`,
      alt: asset.alt.trim() || asset.name,
      caption: asset.caption.trim() || undefined,
      name: asset.name,
      size: asset.size,
    }))
    return {
      ...base,
      type: 'image',
      images:
        images.length || assetImages.length
          ? [...images, ...assetImages]
          : [
              {
                src: '/system-map.svg',
                alt: 'Obraz',
                caption: 'Dodaj opis',
              },
            ],
    }
  }

  if (form.type === 'test') {
    return {
      ...base,
      type: 'test',
      title: form.testTitle.trim() || 'Test',
      questions: form.testQuestions.length
        ? form.testQuestions
        : [createTestQuestion()],
    }
  }

  const textFiles = parseTextFileLines(form.filesText)
  const assetFiles: DownloadFile[] = form.assetFiles.map((file) => ({
    kind: 'asset',
    id: file.id,
    name: file.name,
    size: file.size,
  }))
  const files = [...textFiles, ...assetFiles]
  return {
    ...base,
    type: 'download',
    label: form.downloadLabel.trim() || 'Materiały do pobrania',
    files: files.length
      ? files
      : [
          {
            kind: 'text',
            name: 'Material.txt',
            content: 'Dodaj treść pliku.',
          },
        ],
  }
}

const getElectronApi = () =>
  (window as Window & { electronAPI?: ElectronAPI }).electronAPI

const downloadBlob = async (blob: Blob, fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase()
  const filters = extension
    ? [
        {
          name: extension.toUpperCase(),
          extensions: [extension],
        },
      ]
    : undefined

  const electronApi = getElectronApi()
  if (electronApi?.saveFile) {
    const data = new Uint8Array(await blob.arrayBuffer())
    await electronApi.saveFile({
      defaultPath: fileName,
      data,
      filters,
    })
    return
  }

  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

const createBadge = async (
  studentName: string,
  lessonTitle: string,
): Promise<{ dataUrl: string; blob: Blob | null }> => {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 700
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { dataUrl: '', blob: null }
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#101a2d')
  gradient.addColorStop(1, '#1f4952')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.fillRect(80, 90, canvas.width - 160, canvas.height - 180)

  ctx.fillStyle = '#f6efe4'
  ctx.font = '600 48px "Space Grotesk", "Segoe UI", sans-serif'
  ctx.fillText('TopGun Academy', 130, 180)

  ctx.fillStyle = '#8bbcf5'
  ctx.font = '700 36px "Space Grotesk", "Segoe UI", sans-serif'
  ctx.fillText('Ukończono', 130, 250)

  ctx.fillStyle = '#f8f1e8'
  ctx.font = '500 30px "IBM Plex Sans", "Segoe UI", sans-serif'
  ctx.fillText(`Uczeń: ${studentName}`, 130, 320)
  ctx.fillText(`Lekcja: ${lessonTitle}`, 130, 370)
  ctx.fillText(`Data: ${formatDateTime(new Date())}`, 130, 420)

  ctx.strokeStyle = '#8bbcf5'
  ctx.lineWidth = 6
  ctx.strokeRect(100, 120, canvas.width - 200, canvas.height - 240)

  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((created) => resolve(created), 'image/png'),
  )

  return { dataUrl, blob }
}

const createTestBadge = async (
  studentName: string,
  testTitle: string,
  score: number,
  total: number,
): Promise<{ dataUrl: string; blob: Blob | null }> => {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 700
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { dataUrl: '', blob: null }
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#121927')
  gradient.addColorStop(1, '#234051')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.fillRect(80, 90, canvas.width - 160, canvas.height - 180)

  ctx.fillStyle = '#f6efe4'
  ctx.font = '600 48px "Space Grotesk", "Segoe UI", sans-serif'
  ctx.fillText('TopGun Academy', 130, 180)

  ctx.fillStyle = '#8bbcf5'
  ctx.font = '700 36px "Space Grotesk", "Segoe UI", sans-serif'
  ctx.fillText('Test zakonczony', 130, 250)

  ctx.fillStyle = '#f8f1e8'
  ctx.font = '500 30px "IBM Plex Sans", "Segoe UI", sans-serif'
  ctx.fillText(`Uczen: ${studentName}`, 130, 320)
  ctx.fillText(`Test: ${testTitle}`, 130, 370)
  ctx.fillText(`Wynik: ${score}/${total}`, 130, 420)
  ctx.fillText(`Data: ${formatDateTime(new Date())}`, 130, 470)

  ctx.strokeStyle = '#8bbcf5'
  ctx.lineWidth = 6
  ctx.strokeRect(100, 120, canvas.width - 200, canvas.height - 240)

  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((created) => resolve(created), 'image/png'),
  )

  return { dataUrl, blob }
}

const useLocalStorageState = <T,>(key: string, initialValue: T) => {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue
    }
    const stored = window.localStorage.getItem(key)
    if (!stored) {
      return initialValue
    }
    try {
      return JSON.parse(stored) as T
    } catch {
      return initialValue
    }
  })

  const setStoredValue = (nextValue: T | ((current: T) => T)) => {
    setValue((current) => {
      const resolved =
        typeof nextValue === 'function'
          ? (nextValue as (current: T) => T)(current)
          : nextValue
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(resolved))
      }
      return resolved
    })
  }

  return [value, setStoredValue] as const
}

const buildLessonSearchText = (lesson: Lesson) => {
  const parts = [lesson.title, lesson.summary]
  lesson.rows.forEach((row) => {
    row.columns.forEach((column) => {
      if (column.type === 'text') {
        parts.push(column.markdown)
      }
      if (column.type === 'video') {
        parts.push(column.title, column.description ?? '')
      }
      if (column.type === 'image') {
        column.images.forEach((image) =>
          parts.push(image.alt, image.caption ?? ''),
        )
      }
      if (column.type === 'download') {
        parts.push(column.label)
        const files = Array.isArray(column.files) ? column.files : []
        files.forEach((file) => parts.push(file.name))
      }
      if (column.type === 'test') {
        parts.push(column.title)
        column.questions.forEach((question) => {
          parts.push(question.prompt)
          question.rows.forEach((row) => {
            row.columns.forEach((block) => {
              if (block.type === 'text') {
                parts.push(block.markdown)
              }
              if (block.type === 'video') {
                parts.push(block.title, block.description ?? '')
              }
              if (block.type === 'image') {
                block.images.forEach((image) =>
                  parts.push(image.alt, image.caption ?? ''),
                )
              }
            })
          })
          question.options.forEach((option) => parts.push(option.text))
        })
      }
    })
  })
  return normalizeText(parts.join(' '))
}

const collectLessonAssetIds = (lesson: Lesson) => {
  const assets = new Set<string>()
  lesson.rows.forEach((row) => {
    row.columns.forEach((column) => {
      if (column.type === 'image') {
        column.images.forEach((image) => {
          if (isAssetSrc(image.src)) {
            assets.add(assetIdFromSrc(image.src))
          }
        })
      }
      if (column.type === 'video' && column.assetId) {
        assets.add(column.assetId)
      }
      if (column.type === 'download') {
        column.files.forEach((file) => {
          if (file.kind === 'asset') {
            assets.add(file.id)
          }
        })
      }
      if (column.type === 'test') {
        column.questions.forEach((question) => {
          question.rows.forEach((row) => {
            row.columns.forEach((block) => {
              if (block.type === 'image') {
                block.images.forEach((image) => {
                  if (isAssetSrc(image.src)) {
                    assets.add(assetIdFromSrc(image.src))
                  }
                })
              }
              if (block.type === 'video' && block.assetId) {
                assets.add(block.assetId)
              }
            })
          })
        })
      }
    })
  })
  return assets
}

const collectTestIds = (lesson: Lesson) =>
  lesson.rows
    .flatMap((row) => row.columns)
    .filter((column): column is TestComponent => column.type === 'test')
    .map((test) => test.id)

const remapLessonForImport = (
  lesson: Lesson,
  assetIdMap: Record<string, string>,
  assetSizeMap: Record<string, number>,
) => {
  const mapAssetId = (id?: string) => (id ? assetIdMap[id] : undefined)
  const mapAssetSize = (id?: string) =>
    id ? assetSizeMap[id] ?? undefined : undefined

  const remapContentComponent = (block: ContentComponent): ContentComponent | null => {
    if (block.type === 'text') {
      return { ...block, id: createId('component') }
    }
    if (block.type === 'video') {
      const mappedId = mapAssetId(block.assetId)
      return {
        ...block,
        id: createId('component'),
        assetId: mappedId,
        assetName: mappedId ? block.assetName : undefined,
        assetSize: mapAssetSize(mappedId),
      }
    }
    const images = block.images
      .map((image): ImageItem | null => {
        if (!isAssetSrc(image.src)) {
          return image
        }
        const originalId = assetIdFromSrc(image.src)
        const mappedId = mapAssetId(originalId)
        if (!mappedId) {
          return null
        }
        const size = mapAssetSize(mappedId) ?? image.size
        const nextImage: ImageItem = {
          ...image,
          src: `asset:${mappedId}`,
        }
        if (typeof size === 'number') {
          nextImage.size = size
        } else {
          delete nextImage.size
        }
        return nextImage
      })
      .filter(isDefined)
    return { ...block, id: createId('component'), images }
  }

  return {
    ...lesson,
    id: createId('lesson'),
    rows: lesson.rows.map((row) => ({
      ...row,
      id: createId('row'),
      columns: row.columns.map((column) => {
        if (column.type === 'text' || column.type === 'video' || column.type === 'image') {
          return remapContentComponent(column) ?? { ...column, id: createId('component') }
        }
        if (column.type === 'test') {
          const questions = column.questions.map((question) => ({
            ...question,
            id: createId('question'),
            rows: question.rows.map((rowItem) => ({
              ...rowItem,
              id: createId('qrow'),
              columns: rowItem.columns
                .map((block) => remapContentComponent(block))
                .filter(isDefined),
            })),
            options: question.options.map((option) => ({
              ...option,
              id: createId('opt'),
            })),
          }))
          return {
            ...column,
            id: createId('component'),
            questions,
          }
        }
        const files = column.files
          .map((file): DownloadFile | null => {
            if (file.kind !== 'asset') {
              return file
            }
            const mappedId = mapAssetId(file.id)
            if (!mappedId) {
              return null
            }
            const size = mapAssetSize(mappedId) ?? file.size
            const nextFile: DownloadFile = {
              ...file,
              id: mappedId,
            }
            if (typeof size === 'number') {
              nextFile.size = size
            } else {
              delete nextFile.size
            }
            return nextFile
          })
          .filter(isDefined)
        return {
          ...column,
          id: createId('component'),
          files,
        }
      }),
    })),
  }
}

const isSafeExternalUrl = (value: string) => {
  try {
    const url = new URL(value)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
  } catch {
    return false
  }
}

const openExternalLink = async (url: string) => {
  if (!isSafeExternalUrl(url)) {
    return
  }
  const electronApi = (window as Window & { electronAPI?: ElectronAPI })
    .electronAPI
  if (electronApi?.openExternal) {
    await electronApi.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

const MarkdownBlock = ({ markdown }: { markdown: string }) => {
  const html = useMemo(() => marked.parse(markdown) as string, [markdown])
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const link = target?.closest('a')
    const href = link?.getAttribute('href')
    if (!href) {
      return
    }
    event.preventDefault()
    void openExternalLink(href)
  }
  return (
    <div
      className="markdown"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function App() {
  const markdownAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const richTextRef = useRef<HTMLDivElement | null>(null)
  const [studentName, setStudentName] = useLocalStorageState(
    'tga-student-name',
    'Nowy pilot',
  )
  const [studentPanelOpen, setStudentPanelOpen] = useState(false)
  const [studentDraftName, setStudentDraftName] = useState(studentName)
  const [versionDialogOpen, setVersionDialogOpen] = useState(false)
  const [completedLessons, setCompletedLessons] = useLocalStorageState<string[]>(
    'tga-completed-lessons',
    [],
  )
  const [topics, setTopics] = useLocalStorageState<Topic[]>(
    'tga-topics',
    seedTopics,
  )
  const [assetLibrary, setAssetLibrary] = useLocalStorageState<
    AssetLibraryItem[]
  >('tga-asset-library', [])
  const [activeLessonId, setActiveLessonId] = useState(
    topics[0]?.lessons[0]?.id ?? '',
  )
  const [searchValue, setSearchValue] = useState('')
  const [teacherMode, setTeacherMode] = useState(false)
  const [teacherDialogOpen, setTeacherDialogOpen] = useState(false)
  const [teacherLogin, setTeacherLogin] = useState('')
  const [teacherPassword, setTeacherPassword] = useState('')
  const [teacherError, setTeacherError] = useState('')
  const [teacherModal, setTeacherModal] = useState<TeacherModal | null>(null)
  const [textEditorMode, setTextEditorMode] = useState<'rich' | 'markdown'>(
    'rich',
  )
  const [activeRichColor, setActiveRichColor] = useState<string | null>(null)
  const [richToolbarState, setRichToolbarState] =
    useState<RichToolbarState>(DEFAULT_RICH_TOOLBAR_STATE)
  const linkSelectionRef = useRef<Range | null>(null)
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
  const [linkDraft, setLinkDraft] = useState('https://')
  const [isModalExpanded, setIsModalExpanded] = useState(false)
  const [topicForm, setTopicForm] = useState<TopicFormState>({
    title: '',
    description: '',
  })
  const [lessonForm, setLessonForm] = useState<LessonFormState>({
    topicId: topics[0]?.id ?? '',
    number: 1,
    title: '',
    duration: '',
    difficulty: 'Podstawy',
    summary: '',
  })
  const [componentForm, setComponentForm] = useState<ComponentFormState>({
    type: 'text',
    span: 4,
    markdown: '### Nowy blok\nUzupełnij treść.',
    title: '',
    description: '',
    embedUrl: '',
    imagesText: '',
    downloadLabel: 'Materiały do pobrania',
    filesText: '',
    assetFiles: [],
    imageAssets: [],
    videoAsset: null,
    testTitle: '',
    testQuestions: [],
  })
  const [badgePreview, setBadgePreview] = useState<Record<string, string>>({})
  const [testBadgePreview, setTestBadgePreview] = useState<
    Record<string, string>
  >({})
  const [lessonAutosaves, setLessonAutosaves] = useLocalStorageState<
    Record<string, LessonSnapshot>
  >('tga-lesson-autosave', {})
  const [lessonVersions, setLessonVersions] = useLocalStorageState<
    Record<string, LessonSnapshot[]>
  >('tga-lesson-versions', {})
  const [testProgress, setTestProgress] = useLocalStorageState<
    Record<string, TestProgress>
  >('tga-test-progress', {})
  const [testResults, setTestResults] = useLocalStorageState<
    Record<string, TestResult>
  >('tga-test-results', {})
  const [activeTestId, setActiveTestId] = useState<string | null>(null)
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [editingQuestionComponentId, setEditingQuestionComponentId] =
    useState<string | null>(null)
  const [questionComponentForm, setQuestionComponentForm] =
    useState<ContentComponentFormState>(createEmptyContentForm())
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null)
  const lastAutosaveRef = useRef<Record<string, string>>({})

  const normalizedSearch = normalizeText(searchValue.trim())
  const allLessons = topics.flatMap((topic) => topic.lessons)
  const activeLesson = allLessons.find(
    (lesson) => lesson.id === activeLessonId,
  )
  const activeTopic = topics.find((topic) =>
    topic.lessons.some((lesson) => lesson.id === activeLesson?.id),
  )
  const activeTestComponent = activeTestId
    ? topics
        .flatMap((topic) => topic.lessons)
        .flatMap((lesson) => lesson.rows)
        .flatMap((row) => row.columns)
        .find(
          (column): column is TestComponent =>
            column.type === 'test' && column.id === activeTestId,
        ) ?? null
    : null
  const activeLessonAutosave = activeLesson
    ? lessonAutosaves[activeLesson.id]
    : undefined
  const activeLessonVersions = activeLesson
    ? lessonVersions[activeLesson.id] ?? []
    : []
  const orderedLessonVersions = useMemo(
    () => [...activeLessonVersions].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [activeLessonVersions],
  )
  const libraryImages = useMemo(
    () => assetLibrary.filter((item) => item.kind === 'image'),
    [assetLibrary],
  )
  const libraryVideos = useMemo(
    () => assetLibrary.filter((item) => item.kind === 'video'),
    [assetLibrary],
  )
  const libraryFiles = useMemo(
    () => assetLibrary.filter((item) => item.kind === 'file'),
    [assetLibrary],
  )
  const activeTestProgress = activeTestComponent
    ? testProgress[activeTestComponent.id]
    : undefined
  const activeTestResult = activeTestComponent
    ? testResults[activeTestComponent.id]
    : undefined

  useEffect(() => {
    const normalized = normalizeTopics(topics)
    if (normalized.changed) {
      setTopics(normalized.topics)
    }
  }, [topics, setTopics])

  useEffect(() => {
    if (
      activeLessonId &&
      allLessons.some((lesson) => lesson.id === activeLessonId)
    ) {
      return
    }
    setActiveLessonId(allLessons[0]?.id ?? '')
  }, [activeLessonId, allLessons])

  useEffect(() => {
    if (!teacherMode || !activeLesson) {
      return
    }
    const interval = window.setInterval(() => {
      const signature = JSON.stringify(activeLesson)
      if (signature !== lastAutosaveRef.current[activeLesson.id]) {
        saveLessonAutosave(activeLesson)
      }
    }, 45000)
    return () => window.clearInterval(interval)
  }, [teacherMode, activeLesson])

  useEffect(() => {
    if (activeTestId && !activeTestComponent) {
      setActiveTestId(null)
    }
  }, [activeTestId, activeTestComponent])

  const filteredTopics = useMemo(() => {
    if (!normalizedSearch) {
      return topics
    }
    return topics
      .map((topic) => {
        const lessons = topic.lessons.filter((lesson) =>
          buildLessonSearchText(lesson).includes(normalizedSearch),
        )
        return lessons.length ? { ...topic, lessons } : null
      })
      .filter((topic): topic is Topic => Boolean(topic))
  }, [normalizedSearch, topics])

  const completedCount = completedLessons.length
  const totalLessons = allLessons.length
  const progressPercent = totalLessons
    ? Math.round((completedCount / totalLessons) * 100)
    : 0
  const completedLessonList = useMemo(() => {
    const items: Array<{ lesson: Lesson; topicTitle: string }> = []
    topics.forEach((topic) => {
      topic.lessons.forEach((lesson) => {
        if (!completedLessons.includes(lesson.id)) {
          return
        }
        items.push({ lesson, topicTitle: topic.title })
      })
    })
    return items
  }, [topics, completedLessons])
  const testResultsList = useMemo(() => {
    const items: Array<{
      test: TestComponent
      lessonTitle: string
      result: TestResult
    }> = []
    topics.forEach((topic) => {
      topic.lessons.forEach((lesson) => {
        lesson.rows.forEach((row) => {
          row.columns.forEach((column) => {
            if (column.type !== 'test') {
              return
            }
            const result = testResults[column.id]
            if (!result) {
              return
            }
            items.push({
              test: column,
              lessonTitle: lesson.title,
              result,
            })
          })
        })
      })
    })
    return items
  }, [topics, testResults])

  const highlightMatches = (text: string) => {
    if (!searchValue.trim()) {
      return text
    }
    const lowerText = text.toLowerCase()
    const lowerQuery = searchValue.toLowerCase()
    const index = lowerText.indexOf(lowerQuery)
    if (index === -1) {
      return text
    }
    return (
      <>
        {text.slice(0, index)}
        <mark>{text.slice(index, index + searchValue.length)}</mark>
        {text.slice(index + searchValue.length)}
      </>
    )
  }

  const isLessonCompleted = (lessonId: string) =>
    completedLessons.includes(lessonId)

  const handleSelectLesson = (lessonId: string) => {
    setActiveLessonId(lessonId)
  }

  const handleCompleteLesson = async () => {
    if (!activeLesson || !activeTopic) {
      return
    }
    const confirmed = window.confirm('Na pewno sobie poradzisz?')
    if (!confirmed) {
      return
    }
    if (!completedLessons.includes(activeLesson.id)) {
      setCompletedLessons([...completedLessons, activeLesson.id])
    }
    const badge = await createBadge(studentName, activeLesson.title)
    if (badge.dataUrl) {
      setBadgePreview((previous) => ({
        ...previous,
        [activeLesson.id]: badge.dataUrl,
      }))
    }
    if (badge.blob) {
      const safeStudent = studentName.trim() || 'Uczen'
      await downloadBlob(
        badge.blob,
        `${slugify(safeStudent)}_${slugify(activeLesson.title)}.png`,
      )
    }
  }

  const handleResetLesson = () => {
    if (!activeLesson) {
      return
    }
    setCompletedLessons(
      completedLessons.filter((lessonId) => lessonId !== activeLesson.id),
    )
    setBadgePreview((previous) => {
      const next = { ...previous }
      delete next[activeLesson.id]
      return next
    })
  }

  const saveLessonAutosave = (lesson: Lesson) => {
    const snapshot: LessonSnapshot = {
      savedAt: new Date().toISOString(),
      lesson: cloneLesson(lesson),
    }
    setLessonAutosaves((current) => ({
      ...current,
      [lesson.id]: snapshot,
    }))
    lastAutosaveRef.current[lesson.id] = JSON.stringify(lesson)
  }

  const saveLessonVersion = (lesson: Lesson) => {
    const snapshot: LessonSnapshot = {
      savedAt: new Date().toISOString(),
      lesson: cloneLesson(lesson),
    }
    setLessonVersions((current) => {
      const existing = current[lesson.id] ?? []
      const next = [...existing, snapshot].slice(-MAX_LESSON_VERSIONS)
      return { ...current, [lesson.id]: next }
    })
  }

  const restoreLessonSnapshot = (snapshot: LessonSnapshot) => {
    setTopics((current) =>
      current.map((topic) => ({
        ...topic,
        lessons: topic.lessons.map((lesson) =>
          lesson.id === snapshot.lesson.id ? cloneLesson(snapshot.lesson) : lesson,
        ),
      })),
    )
    lastAutosaveRef.current[snapshot.lesson.id] = JSON.stringify(snapshot.lesson)
  }

  const openStudentPanel = () => {
    setStudentDraftName(studentName)
    setStudentPanelOpen(true)
  }

  const handleSaveStudentProfile = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const trimmed = studentDraftName.trim()
    setStudentName(trimmed || 'Nowy pilot')
    setStudentPanelOpen(false)
  }

  const handleDownloadLessonBadge = async (lesson: Lesson) => {
    const badge = await createBadge(studentName, lesson.title)
    if (badge.dataUrl) {
      setBadgePreview((previous) => ({
        ...previous,
        [lesson.id]: badge.dataUrl,
      }))
    }
    if (badge.blob) {
      const safeStudent = studentName.trim() || 'Uczen'
      await downloadBlob(
        badge.blob,
        `${slugify(safeStudent)}_${slugify(lesson.title)}.png`,
      )
    }
  }

  const handleDownloadTestBadge = async (
    test: TestComponent,
    result: TestResult,
  ) => {
    const badge = await createTestBadge(
      studentName,
      test.title,
      result.score,
      result.total,
    )
    if (badge.dataUrl) {
      setTestBadgePreview((previous) => ({
        ...previous,
        [test.id]: badge.dataUrl,
      }))
    }
    if (badge.blob) {
      const safeStudent = studentName.trim() || 'Uczen'
      await downloadBlob(
        badge.blob,
        `${slugify(safeStudent)}_${slugify(test.title)}.png`,
      )
    }
  }

  const handleSaveLessonVersion = () => {
    if (!activeLesson) {
      return
    }
    if (activeLessonVersions.length > 0) {
      const confirmed = window.confirm(
        `Masz juz zapisane wersje (${activeLessonVersions.length}/${MAX_LESSON_VERSIONS}). ` +
          'Zapisanie kolejnej wersji moze nadpisac najstarsza. Kontynuowac?',
      )
      if (!confirmed) {
        return
      }
    }
    saveLessonVersion(activeLesson)
  }

  const handleRestoreLessonVersion = () => {
    if (!activeLessonVersions.length) {
      return
    }
    setVersionDialogOpen(true)
  }

  const handleDeleteLessonVersion = (savedAt: string) => {
    if (!activeLesson) {
      return
    }
    const confirmed = window.confirm('Usunac te wersje?')
    if (!confirmed) {
      return
    }
    setLessonVersions((current) => {
      const existing = current[activeLesson.id] ?? []
      const nextVersions = existing.filter((version) => version.savedAt !== savedAt)
      return { ...current, [activeLesson.id]: nextVersions }
    })
  }

  const handleRestoreLessonAutosave = () => {
    if (!activeLesson || !activeLessonAutosave) {
      return
    }
    const confirmed = window.confirm('Przywrócić ostatni autozapis?')
    if (!confirmed) {
      return
    }
    restoreLessonSnapshot(activeLessonAutosave)
  }

  const ensureTestProgress = (test: TestComponent) => {
    const existing = testProgress[test.id]
    if (!existing) {
      return buildTestProgress(test)
    }
    const questionIds = test.questions.map((question) => question.id)
    const orderMismatch =
      existing.questionOrder.length !== questionIds.length ||
      existing.questionOrder.some((id) => !questionIds.includes(id)) ||
      questionIds.some((id) => !existing.questionOrder.includes(id))
    if (orderMismatch) {
      return buildTestProgress(test)
    }
    const nextOptionOrder: Record<string, string[]> = {}
    const nextAnswers: Record<string, string[]> = {}
    test.questions.forEach((question) => {
      const optionIds = question.options.map((option) => option.id)
      const currentOrder = existing.optionOrder[question.id] ?? []
      const optionMismatch =
        currentOrder.length !== optionIds.length ||
        currentOrder.some((id) => !optionIds.includes(id))
      nextOptionOrder[question.id] = optionMismatch
        ? shuffleArray(optionIds)
        : currentOrder
      const selected = existing.answers[question.id] ?? []
      nextAnswers[question.id] = selected.filter((id) =>
        optionIds.includes(id),
      )
    })
    return {
      ...existing,
      questionOrder: existing.questionOrder,
      optionOrder: nextOptionOrder,
      answers: nextAnswers,
      currentIndex: Math.min(
        existing.currentIndex,
        Math.max(0, questionIds.length - 1),
      ),
    }
  }

  const handleStartTest = (test: TestComponent) => {
    const nextProgress = ensureTestProgress(test)
    setTestProgress((current) => ({
      ...current,
      [test.id]: nextProgress,
    }))
    setActiveTestId(test.id)
    setShowCorrectAnswers(false)
  }

  const handleViewTestResult = (testId: string) => {
    setActiveTestId(testId)
    setShowCorrectAnswers(false)
  }

  const handleCloseTest = () => {
    setActiveTestId(null)
    setShowCorrectAnswers(false)
  }

  const handleResetTest = (testId: string) => {
    setTestProgress((current) => {
      const next = { ...current }
      delete next[testId]
      return next
    })
    setTestResults((current) => {
      const next = { ...current }
      delete next[testId]
      return next
    })
    setTestBadgePreview((previous) => {
      const next = { ...previous }
      delete next[testId]
      return next
    })
  }

  const handleTestAnswerToggle = (
    testId: string,
    questionId: string,
    optionId: string,
  ) => {
    setTestProgress((current) => {
      const progress = current[testId]
      if (!progress) {
        return current
      }
      const selected = new Set(progress.answers[questionId] ?? [])
      if (selected.has(optionId)) {
        selected.delete(optionId)
      } else {
        selected.add(optionId)
      }
      return {
        ...current,
        [testId]: {
          ...progress,
          answers: {
            ...progress.answers,
            [questionId]: Array.from(selected),
          },
        },
      }
    })
  }

  const handleTestNavigation = (testId: string, direction: 'next' | 'prev') => {
    setTestProgress((current) => {
      const progress = current[testId]
      if (!progress) {
        return current
      }
      const delta = direction === 'next' ? 1 : -1
      const nextIndex = Math.max(
        0,
        Math.min(progress.currentIndex + delta, progress.questionOrder.length - 1),
      )
      return {
        ...current,
        [testId]: {
          ...progress,
          currentIndex: nextIndex,
        },
      }
    })
  }

  const handleFinishTest = async (test: TestComponent) => {
    const progress = testProgress[test.id]
    if (!progress) {
      return
    }
    const score = calculateTestScore(test, progress.answers)
    const total = test.questions.length
    setTestResults((current) => ({
      ...current,
      [test.id]: {
        completedAt: new Date().toISOString(),
        score,
        total,
      },
    }))
    setTestProgress((current) => {
      const next = { ...current }
      delete next[test.id]
      return next
    })
    const badge = await createTestBadge(studentName, test.title, score, total)
    if (badge.dataUrl) {
      setTestBadgePreview((previous) => ({
        ...previous,
        [test.id]: badge.dataUrl,
      }))
    }
    if (badge.blob) {
      const safeStudent = studentName.trim() || 'Uczen'
      await downloadBlob(
        badge.blob,
        `${slugify(safeStudent)}_${slugify(test.title)}.png`,
      )
    }
  }

  const openAddTopic = () => {
    setIsModalExpanded(false)
    setTopicForm({ title: '', description: '' })
    setTeacherModal({ type: 'add-topic' })
  }

  const openEditTopic = (topic: Topic) => {
    setIsModalExpanded(false)
    setTopicForm({ title: topic.title, description: topic.description })
    setTeacherModal({ type: 'edit-topic', topicId: topic.id })
  }

  const openAddLesson = (topicId?: string) => {
    setIsModalExpanded(false)
    const selectedTopicId =
      topicId || activeTopic?.id || topics[0]?.id || ''
    const targetTopic = topics.find((topic) => topic.id === selectedTopicId)
    const maxNumber =
      targetTopic?.lessons.reduce(
        (max, lesson) => Math.max(max, lesson.number),
        0,
      ) ?? 0
    setLessonForm({
      topicId: selectedTopicId,
      number: maxNumber + 1,
      title: '',
      duration: '',
      difficulty: 'Podstawy',
      summary: '',
    })
    setTeacherModal({ type: 'add-lesson' })
  }

  const openEditLesson = (lesson: Lesson, topicId: string) => {
    setIsModalExpanded(false)
    setLessonForm({
      topicId,
      number: lesson.number,
      title: lesson.title,
      duration: lesson.duration,
      difficulty: lesson.difficulty,
      summary: lesson.summary,
    })
    setTeacherModal({ type: 'edit-lesson', lessonId: lesson.id })
  }

  const openAddComponent = (lessonId: string) => {
    setIsModalExpanded(false)
    setTextEditorMode('rich')
    cancelQuestionComponentEdit()
    const lessonTitle =
      topics
        .flatMap((topic) => topic.lessons)
        .find((lesson) => lesson.id === lessonId)?.title ?? ''
    const defaultTestTitle = lessonTitle
      ? `Test: ${lessonTitle}`
      : 'Test'
    setComponentForm({
      type: 'text',
      span: 4,
      markdown: '### Nowy blok\nUzupełnij treść.',
      title: '',
      description: '',
      embedUrl: '',
      imagesText: '',
      downloadLabel: 'Materiały do pobrania',
      filesText: '',
      assetFiles: [],
      imageAssets: [],
      videoAsset: null,
      testTitle: defaultTestTitle,
      testQuestions: [createTestQuestion()],
    })
    setTeacherModal({ type: 'add-component', lessonId })
  }

  const openEditComponent = (lessonId: string, component: LessonComponent) => {
    setIsModalExpanded(false)
    cancelQuestionComponentEdit()
    if (component.type === 'text') {
      const isHtml = /<\/?[a-z][\s\S]*>/i.test(component.markdown)
      setTextEditorMode(isHtml ? 'rich' : 'markdown')
      setComponentForm({
        type: 'text',
        span: component.span,
        markdown: component.markdown,
        title: '',
        description: '',
        embedUrl: '',
        imagesText: '',
        downloadLabel: 'Materiały do pobrania',
        filesText: '',
        assetFiles: [],
        imageAssets: [],
        videoAsset: null,
        testTitle: '',
        testQuestions: [],
      })
    }
    if (component.type === 'video') {
      const videoAsset = component.assetId
        ? {
            id: component.assetId,
            name: component.assetName ?? 'Wideo',
            size: component.assetSize,
          }
        : null
      setComponentForm({
        type: 'video',
        span: component.span,
        markdown: '',
        title: component.title,
        description: component.description ?? '',
        embedUrl: component.embedUrl ?? '',
        imagesText: '',
        downloadLabel: 'Materiały do pobrania',
        filesText: '',
        assetFiles: [],
        imageAssets: [],
        videoAsset,
        testTitle: '',
        testQuestions: [],
      })
    }
    if (component.type === 'image') {
      const assetImages = component.images
        .filter((image) => isAssetSrc(image.src))
        .map((image) => ({
          id: assetIdFromSrc(image.src),
          name: image.name ?? image.alt,
          size: image.size,
          alt: image.alt,
          caption: image.caption ?? '',
        }))
      const urlImages = component.images.filter(
        (image) => !isAssetSrc(image.src),
      )
      setComponentForm({
        type: 'image',
        span: component.span,
        markdown: '',
        title: '',
        description: '',
        embedUrl: '',
        imagesText: formatImageLines(urlImages),
        downloadLabel: 'Materiały do pobrania',
        filesText: '',
        assetFiles: [],
        imageAssets: assetImages,
        videoAsset: null,
        testTitle: '',
        testQuestions: [],
      })
    }
    if (component.type === 'download') {
      const textFiles = component.files.filter(
        (file) => file.kind !== 'asset',
      )
      const assetFiles = component.files
        .filter((file) => file.kind === 'asset')
        .map((file) => ({
          id: file.id,
          name: file.name,
          size: file.size,
        }))
      setComponentForm({
        type: 'download',
        span: component.span,
        markdown: '',
        title: '',
        description: '',
        embedUrl: '',
        imagesText: '',
        downloadLabel: component.label,
        filesText: formatTextFileLines(textFiles),
        assetFiles,
        imageAssets: [],
        videoAsset: null,
        testTitle: '',
        testQuestions: [],
      })
    }
    if (component.type === 'test') {
      setComponentForm({
        type: 'test',
        span: component.span,
        markdown: '',
        title: '',
        description: '',
        embedUrl: '',
        imagesText: '',
        downloadLabel: 'Materiały do pobrania',
        filesText: '',
        assetFiles: [],
        imageAssets: [],
        videoAsset: null,
        testTitle: component.title,
        testQuestions: component.questions,
      })
    }
    setTeacherModal({
      type: 'edit-component',
      lessonId,
      componentId: component.id,
    })
  }

  const closeTeacherModal = () => {
    setTeacherModal(null)
    setIsModalExpanded(false)
  }

  const handleSaveTopic = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = topicForm.title.trim()
    if (!title) {
      return
    }
    const description = topicForm.description.trim()
    if (teacherModal?.type === 'add-topic') {
      const nextTopic: Topic = {
        id: createId('topic'),
        title,
        description,
        lessons: [],
      }
      setTopics((current) => [...current, nextTopic])
    }
    if (teacherModal?.type === 'edit-topic') {
      setTopics((current) =>
        current.map((topic) =>
          topic.id === teacherModal.topicId
            ? { ...topic, title, description }
            : topic,
        ),
      )
    }
    closeTeacherModal()
  }

  const handleDeleteTopic = (topicId: string) => {
    const topic = topics.find((item) => item.id === topicId)
    if (!topic) {
      return
    }
    const confirmed = window.confirm(
      'Czy na pewno chcesz usunąć temat wraz z lekcjami?',
    )
    if (!confirmed) {
      return
    }
    const removedLessonIds = topic.lessons.map((lesson) => lesson.id)
    const removedTestIds = topic.lessons.flatMap((lesson) =>
      collectTestIds(lesson),
    )
    const nextTopics = topics.filter((item) => item.id !== topicId)
    setTopics(nextTopics)
    setCompletedLessons((current) =>
      current.filter((lessonId) => !removedLessonIds.includes(lessonId)),
    )
    setBadgePreview((previous) => {
      const next = { ...previous }
      removedLessonIds.forEach((lessonId) => {
        delete next[lessonId]
      })
      return next
    })
    setLessonAutosaves((current) => {
      const next = { ...current }
      removedLessonIds.forEach((lessonId) => {
        delete next[lessonId]
        delete lastAutosaveRef.current[lessonId]
      })
      return next
    })
    setLessonVersions((current) => {
      const next = { ...current }
      removedLessonIds.forEach((lessonId) => {
        delete next[lessonId]
      })
      return next
    })
    if (removedTestIds.length) {
      setTestProgress((current) => {
        const next = { ...current }
        removedTestIds.forEach((id) => delete next[id])
        return next
      })
      setTestResults((current) => {
        const next = { ...current }
        removedTestIds.forEach((id) => delete next[id])
        return next
      })
      setTestBadgePreview((previous) => {
        const next = { ...previous }
        removedTestIds.forEach((id) => delete next[id])
        return next
      })
    }
    if (removedLessonIds.includes(activeLessonId)) {
      const nextLessonId =
        nextTopics.flatMap((topicItem) => topicItem.lessons)[0]?.id ?? ''
      setActiveLessonId(nextLessonId)
    }
  }

  const handleSaveLesson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = lessonForm.title.trim()
    if (!title || !lessonForm.topicId) {
      return
    }
    const duration = lessonForm.duration.trim() || '20 min'
    const difficulty = lessonForm.difficulty.trim() || 'Podstawy'
    const summary = lessonForm.summary.trim() || 'Opis lekcji.'
    const number = Number(lessonForm.number) || 1

    if (teacherModal?.type === 'add-lesson') {
      const newLesson: Lesson = {
        id: createId('lesson'),
        number,
        title,
        duration,
        difficulty,
        summary,
        rows: [createPlaceholderRow()],
      }
      setTopics((current) =>
        current.map((topic) =>
          topic.id === lessonForm.topicId
            ? { ...topic, lessons: [...topic.lessons, newLesson] }
            : topic,
        ),
      )
      setActiveLessonId(newLesson.id)
    }

    if (teacherModal?.type === 'edit-lesson') {
      setTopics((current) =>
        current.map((topic) => ({
          ...topic,
          lessons: topic.lessons.map((lesson) =>
            lesson.id === teacherModal.lessonId
              ? {
                  ...lesson,
                  title,
                  duration,
                  difficulty,
                  summary,
                  number,
                }
              : lesson,
          ),
        })),
      )
    }
    closeTeacherModal()
  }

  const handleDeleteLesson = (lessonId: string) => {
    const confirmed = window.confirm('Czy na pewno chcesz usunąć tę lekcję?')
    if (!confirmed) {
      return
    }
    const lessonToDelete = topics
      .flatMap((topic) => topic.lessons)
      .find((lesson) => lesson.id === lessonId)
    const testIds = lessonToDelete ? collectTestIds(lessonToDelete) : []
    const nextTopics = topics.map((topic) => ({
      ...topic,
      lessons: topic.lessons.filter((lesson) => lesson.id !== lessonId),
    }))
    setTopics(nextTopics)
    setCompletedLessons((current) =>
      current.filter((completedId) => completedId !== lessonId),
    )
    setBadgePreview((previous) => {
      const next = { ...previous }
      delete next[lessonId]
      return next
    })
    setLessonAutosaves((current) => {
      const next = { ...current }
      delete next[lessonId]
      delete lastAutosaveRef.current[lessonId]
      return next
    })
    setLessonVersions((current) => {
      const next = { ...current }
      delete next[lessonId]
      return next
    })
    if (testIds.length) {
      setTestProgress((current) => {
        const next = { ...current }
        testIds.forEach((id) => delete next[id])
        return next
      })
      setTestResults((current) => {
        const next = { ...current }
        testIds.forEach((id) => delete next[id])
        return next
      })
      setTestBadgePreview((previous) => {
        const next = { ...previous }
        testIds.forEach((id) => delete next[id])
        return next
      })
    }
    if (activeLessonId === lessonId) {
      const nextLessonId =
        nextTopics.flatMap((topicItem) => topicItem.lessons)[0]?.id ?? ''
      setActiveLessonId(nextLessonId)
    }
  }

  const handleSaveComponent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!teacherModal) {
      return
    }
    if (componentForm.type === 'test') {
      const validationError = validateTestQuestions(componentForm.testQuestions)
      if (validationError) {
        window.alert(validationError)
        return
      }
    }
    const markdownOverride =
      componentForm.type === 'text' && textEditorMode === 'rich'
        ? richTextRef.current?.innerHTML ?? componentForm.markdown
        : componentForm.markdown
    const component = buildComponentFromForm(
      { ...componentForm, markdown: markdownOverride },
      teacherModal.type === 'edit-component' ? teacherModal.componentId : undefined,
    )
    if (teacherModal.type === 'add-component') {
      setTopics((current) =>
        current.map((topic) => ({
          ...topic,
          lessons: topic.lessons.map((lesson) =>
            lesson.id === teacherModal.lessonId
              ? {
                  ...lesson,
                  rows: addComponentToRows(lesson.rows, component),
                }
              : lesson,
          ),
        })),
      )
    }
    if (teacherModal.type === 'edit-component') {
      setTopics((current) =>
        current.map((topic) => ({
          ...topic,
          lessons: topic.lessons.map((lesson) =>
            lesson.id === teacherModal.lessonId
              ? {
                  ...lesson,
                  rows: updateComponentInRows(
                    lesson.rows,
                    teacherModal.componentId,
                    component,
                  ),
                }
              : lesson,
          ),
        })),
      )
    }
    closeTeacherModal()
  }

  const handleDeleteComponent = (lessonId: string, componentId: string) => {
    const confirmed = window.confirm('Czy na pewno chcesz usunąć komponent?')
    if (!confirmed) {
      return
    }
    const componentToDelete = topics
      .flatMap((topic) => topic.lessons)
      .find((lesson) => lesson.id === lessonId)
      ?.rows.flatMap((row) => row.columns)
      .find((column) => column.id === componentId)
    if (componentToDelete?.type === 'test') {
      setTestProgress((current) => {
        const next = { ...current }
        delete next[componentToDelete.id]
        return next
      })
      setTestResults((current) => {
        const next = { ...current }
        delete next[componentToDelete.id]
        return next
      })
      setTestBadgePreview((previous) => {
        const next = { ...previous }
        delete next[componentToDelete.id]
        return next
      })
    }
    setTopics((current) =>
      current.map((topic) => ({
        ...topic,
        lessons: topic.lessons.map((lesson) => {
          if (lesson.id !== lessonId) {
            return lesson
          }
          const nextRows = removeComponentFromRows(lesson.rows, componentId)
          return {
            ...lesson,
            rows: nextRows.length ? nextRows : [createPlaceholderRow()],
          }
        }),
      })),
    )
  }

  const handleAddRow = (lessonId: string) => {
    setTopics((current) =>
      current.map((topic) => ({
        ...topic,
        lessons: topic.lessons.map((lesson) =>
          lesson.id === lessonId
            ? {
                ...lesson,
                rows: [...lesson.rows, createPlaceholderRow()],
              }
            : lesson,
        ),
      })),
    )
  }

  const updateTestQuestions = (
    updater: (current: TestQuestion[]) => TestQuestion[],
  ) => {
    setComponentForm((current) =>
      current.type === 'test'
        ? {
            ...current,
            testQuestions: updater(current.testQuestions),
          }
        : current,
    )
  }

  const updateTestQuestion = (
    questionId: string,
    updater: (question: TestQuestion) => TestQuestion,
  ) => {
    updateTestQuestions((questions) =>
      questions.map((question) =>
        question.id === questionId ? updater(question) : question,
      ),
    )
  }

  const handleAddTestQuestion = () => {
    updateTestQuestions((questions) => [...questions, createTestQuestion()])
  }

  const handleRemoveTestQuestion = (questionId: string) => {
    updateTestQuestions((questions) =>
      questions.filter((question) => question.id !== questionId),
    )
  }

  const handleQuestionOptionCountChange = (
    questionId: string,
    nextCount: number,
  ) => {
    updateTestQuestion(questionId, (question) => {
      const nextOptions = ensureOptionCount(question.options, nextCount)
      const hasCorrect = nextOptions.some((option) => option.isCorrect)
      if (!hasCorrect && nextOptions.length) {
        nextOptions[0].isCorrect = true
      }
      return { ...question, options: nextOptions }
    })
  }

  const handleQuestionOptionToggle = (
    questionId: string,
    optionId: string,
  ) => {
    updateTestQuestion(questionId, (question) => {
      const nextOptions = question.options.map((option) =>
        option.id === optionId
          ? { ...option, isCorrect: !option.isCorrect }
          : option,
      )
      const hasCorrect = nextOptions.some((option) => option.isCorrect)
      if (!hasCorrect) {
        return question
      }
      return { ...question, options: nextOptions }
    })
  }

  const startQuestionComponentEdit = (
    questionId: string,
    component?: ContentComponent,
  ) => {
    setActiveQuestionId(questionId)
    setEditingQuestionComponentId(component?.id ?? null)
    setQuestionComponentForm(
      component ? buildContentFormFromComponent(component) : createEmptyContentForm(),
    )
  }

  const cancelQuestionComponentEdit = () => {
    setActiveQuestionId(null)
    setEditingQuestionComponentId(null)
    setQuestionComponentForm(createEmptyContentForm())
  }

  const handleSaveQuestionComponent = (questionId: string) => {
    const component = buildContentComponentFromForm(
      questionComponentForm,
      editingQuestionComponentId ?? undefined,
    )
    updateTestQuestion(questionId, (question) => {
      const nextRows = editingQuestionComponentId
        ? updateQuestionComponentInRows(
            question.rows,
            editingQuestionComponentId,
            component,
          )
        : addComponentToQuestionRows(question.rows, component)
      return { ...question, rows: nextRows }
    })
    cancelQuestionComponentEdit()
  }

  const handleRemoveQuestionComponent = (
    questionId: string,
    componentId: string,
  ) => {
    updateTestQuestion(questionId, (question) => ({
      ...question,
      rows: removeQuestionComponentFromRows(question.rows, componentId),
    }))
  }

  const handleAddQuestionRow = (questionId: string) => {
    updateTestQuestion(questionId, (question) => ({
      ...question,
      rows: [...question.rows, createQuestionPlaceholderRow()],
    }))
  }

  const addAssetsToLibrary = (items: AssetFile[], kind: AssetLibraryKind) => {
    if (!items.length) {
      return
    }
    setAssetLibrary((current) => {
      const existing = new Set(current.map((item) => item.id))
      const next = [...current]
      const addedAt = new Date().toISOString()
      items.forEach((item) => {
        if (existing.has(item.id)) {
          return
        }
        next.push({ ...item, kind, addedAt })
      })
      return next
    })
  }

  const removeAssetFromLibrary = (assetId: string) => {
    setAssetLibrary((current) => current.filter((item) => item.id !== assetId))
  }

  const addLibraryDownloadFile = (item: AssetLibraryItem) => {
    setComponentForm((current) => {
      if (current.assetFiles.some((file) => file.id === item.id)) {
        return current
      }
      return {
        ...current,
        assetFiles: [
          ...current.assetFiles,
          { id: item.id, name: item.name, size: item.size },
        ],
      }
    })
  }

  const addLibraryImageAsset = (item: AssetLibraryItem) => {
    setComponentForm((current) => {
      if (current.imageAssets.some((file) => file.id === item.id)) {
        return current
      }
      return {
        ...current,
        imageAssets: [
          ...current.imageAssets,
          { id: item.id, name: item.name, size: item.size, alt: item.name, caption: '' },
        ],
      }
    })
  }

  const useLibraryVideoAsset = (item: AssetLibraryItem) => {
    setComponentForm((current) => ({
      ...current,
      videoAsset: { id: item.id, name: item.name, size: item.size },
    }))
  }

  const addLibraryQuestionImage = (item: AssetLibraryItem) => {
    setQuestionComponentForm((current) => {
      if (current.imageAssets.some((file) => file.id === item.id)) {
        return current
      }
      return {
        ...current,
        imageAssets: [
          ...current.imageAssets,
          { id: item.id, name: item.name, size: item.size, alt: item.name, caption: '' },
        ],
      }
    })
  }

  const useLibraryQuestionVideo = (item: AssetLibraryItem) => {
    setQuestionComponentForm((current) => ({
      ...current,
      videoAsset: { id: item.id, name: item.name, size: item.size },
    }))
  }

  const handlePickLibraryImages = async () => {
    const electronApi = getElectronApi()
    if (!electronApi?.pickFiles) {
      window.alert(
        'Dodawanie plików jest dostępne tylko w aplikacji desktopowej.',
      )
      return
    }
    const picked = await electronApi.pickFiles({
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
        },
      ],
    })
    addAssetsToLibrary(picked, 'image')
  }

  const handlePickLibraryVideos = async () => {
    const electronApi = getElectronApi()
    if (!electronApi?.pickFiles) {
      window.alert(
        'Dodawanie plików jest dostępne tylko w aplikacji desktopowej.',
      )
      return
    }
    const picked = await electronApi.pickFiles({
      filters: [
        {
          name: 'Video',
          extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
        },
      ],
    })
    addAssetsToLibrary(picked, 'video')
  }

  const handlePickLibraryFiles = async () => {
    const electronApi = getElectronApi()
    if (!electronApi?.pickFiles) {
      window.alert(
        'Dodawanie plików jest dostępne tylko w aplikacji desktopowej.',
      )
      return
    }
    const picked = await electronApi.pickFiles()
    addAssetsToLibrary(picked, 'file')
  }

  const handlePickDownloadAssets = async () => {
    const electronApi = getElectronApi()
    if (!electronApi?.pickFiles) {
      window.alert(
        'Dodawanie plików jest dostępne tylko w aplikacji desktopowej.',
      )
      return
    }
    const picked = await electronApi.pickFiles()
    if (!picked.length) {
      return
    }
    addAssetsToLibrary(picked, 'file')
    setComponentForm((current) => ({
      ...current,
      assetFiles: [...current.assetFiles, ...picked],
    }))
  }

  const handleRemoveAsset = (assetId: string) => {
    setComponentForm((current) => ({
      ...current,
      assetFiles: current.assetFiles.filter((file) => file.id !== assetId),
    }))
  }

  const handlePickImageAssets = async () => {
    const electronApi = getElectronApi()
    if (!electronApi?.pickFiles) {
      window.alert(
        'Dodawanie plików jest dostępne tylko w aplikacji desktopowej.',
      )
      return
    }
    const picked = await electronApi.pickFiles({
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
        },
      ],
    })
    if (!picked.length) {
      return
    }
    addAssetsToLibrary(picked, 'image')
    const mapped: ImageAssetForm[] = picked.map((file) => ({
      ...file,
      alt: file.name,
      caption: '',
    }))
    setComponentForm((current) => ({
      ...current,
      imageAssets: [...current.imageAssets, ...mapped],
    }))
  }

  const handleRemoveImageAsset = (assetId: string) => {
    setComponentForm((current) => ({
      ...current,
      imageAssets: current.imageAssets.filter((file) => file.id !== assetId),
    }))
  }

  const handlePickVideoAsset = async () => {
    const electronApi = getElectronApi()
    if (!electronApi?.pickFiles) {
      window.alert(
        'Dodawanie plików jest dostępne tylko w aplikacji desktopowej.',
      )
      return
    }
    const picked = await electronApi.pickFiles({
      filters: [
        {
          name: 'Video',
          extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
        },
      ],
    })
    if (!picked.length) {
      return
    }
    addAssetsToLibrary(picked, 'video')
    setComponentForm((current) => ({
      ...current,
      videoAsset: picked[0],
    }))
  }

  const handleRemoveVideoAsset = () => {
    setComponentForm((current) => ({
      ...current,
      videoAsset: null,
    }))
  }

  const handlePickQuestionImageAssets = async () => {
    const electronApi = getElectronApi()
    if (!electronApi?.pickFiles) {
      window.alert(
        'Dodawanie plikow jest dostepne tylko w aplikacji desktopowej.',
      )
      return
    }
    const picked = await electronApi.pickFiles({
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
        },
      ],
    })
    if (!picked.length) {
      return
    }
    addAssetsToLibrary(picked, 'image')
    const mapped: ImageAssetForm[] = picked.map((file) => ({
      ...file,
      alt: file.name,
      caption: '',
    }))
    setQuestionComponentForm((current) => ({
      ...current,
      imageAssets: [...current.imageAssets, ...mapped],
    }))
  }

  const handleRemoveQuestionImageAsset = (assetId: string) => {
    setQuestionComponentForm((current) => ({
      ...current,
      imageAssets: current.imageAssets.filter((file) => file.id !== assetId),
    }))
  }

  const handlePickQuestionVideoAsset = async () => {
    const electronApi = getElectronApi()
    if (!electronApi?.pickFiles) {
      window.alert(
        'Dodawanie plikow jest dostepne tylko w aplikacji desktopowej.',
      )
      return
    }
    const picked = await electronApi.pickFiles({
      filters: [
        {
          name: 'Video',
          extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
        },
      ],
    })
    if (!picked.length) {
      return
    }
    addAssetsToLibrary(picked, 'video')
    setQuestionComponentForm((current) => ({
      ...current,
      videoAsset: picked[0],
    }))
  }

  const handleRemoveQuestionVideoAsset = () => {
    setQuestionComponentForm((current) => ({
      ...current,
      videoAsset: null,
    }))
  }

  useEffect(() => {
    if (componentForm.type !== 'text' || textEditorMode !== 'rich') {
      return
    }
    const element = richTextRef.current
    if (!element) {
      return
    }
    const source = componentForm.markdown.trim()
    const html = /<\/?[a-z][\s\S]*>/i.test(source)
      ? source
      : (marked.parse(source) as string)
    element.innerHTML = html
  }, [componentForm.markdown, componentForm.type, textEditorMode])

  const updateMarkdownValue = (
    nextValue: string,
    selectionStart?: number,
    selectionEnd?: number,
  ) => {
    setComponentForm((current) => ({
      ...current,
      markdown: nextValue,
    }))
    if (
      selectionStart === undefined ||
      selectionEnd === undefined ||
      !markdownAreaRef.current
    ) {
      return
    }
    requestAnimationFrame(() => {
      const element = markdownAreaRef.current
      if (!element) {
        return
      }
      element.focus()
      element.setSelectionRange(selectionStart, selectionEnd)
    })
  }

  const wrapSelection = (
    prefix: string,
    suffix: string,
    placeholder: string,
  ) => {
    const element = markdownAreaRef.current
    if (!element) {
      return
    }
    const { value, selectionStart, selectionEnd } = element
    const selected = value.slice(selectionStart, selectionEnd) || placeholder
    const nextValue =
      value.slice(0, selectionStart) +
      prefix +
      selected +
      suffix +
      value.slice(selectionEnd)
    const nextStart = selectionStart + prefix.length
    const nextEnd = nextStart + selected.length
    updateMarkdownValue(nextValue, nextStart, nextEnd)
  }

  const applyLinePrefix = (prefix: string, ordered = false) => {
    const element = markdownAreaRef.current
    if (!element) {
      return
    }
    const { value, selectionStart, selectionEnd } = element
    const blockStart = value.lastIndexOf('\n', selectionStart - 1) + 1
    const blockEndIndex = value.indexOf('\n', selectionEnd)
    const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex
    const block = value.slice(blockStart, blockEnd)
    const lines = block.split('\n')
    const prefixed = lines
      .map((line, index) => {
        const linePrefix = ordered ? `${index + 1}. ` : prefix
        return line.trim().length ? `${linePrefix}${line}` : line
      })
      .join('\n')
    const nextValue =
      value.slice(0, blockStart) + prefixed + value.slice(blockEnd)
    updateMarkdownValue(nextValue, blockStart, blockStart + prefixed.length)
  }

  const insertLink = () => {
    const element = markdownAreaRef.current
    if (!element) {
      return
    }
    const { value, selectionStart, selectionEnd } = element
    const selected = value.slice(selectionStart, selectionEnd) || 'tekst'
    const link = `[${selected}](https://)`
    const nextValue =
      value.slice(0, selectionStart) + link + value.slice(selectionEnd)
    const urlStart = selectionStart + selected.length + 3
    const urlEnd = urlStart + 'https://'.length
    updateMarkdownValue(nextValue, urlStart, urlEnd)
  }

  const insertSeparator = () => {
    const element = markdownAreaRef.current
    if (!element) {
      return
    }
    const { value, selectionStart } = element
    const insertion = '\n---\n'
    const nextValue =
      value.slice(0, selectionStart) + insertion + value.slice(selectionStart)
    const cursor = selectionStart + insertion.length
    updateMarkdownValue(nextValue, cursor, cursor)
  }

  const updateRichSelectionState = () => {
    const element = richTextRef.current
    if (!element) {
      return
    }
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0) {
      setActiveRichColor(null)
      setRichToolbarState(DEFAULT_RICH_TOOLBAR_STATE)
      return
    }
    if (!element.contains(selection.anchorNode)) {
      setActiveRichColor(null)
      setRichToolbarState(DEFAULT_RICH_TOOLBAR_STATE)
      return
    }

    let color: string | null = null
    try {
      const raw = document.queryCommandValue('foreColor') as string
      color = normalizeColor(raw)
    } catch (error) {
      console.warn('Nie mozna odczytac koloru', error)
    }
    setActiveRichColor(color)

    const formatBlockRaw = document.queryCommandValue('formatBlock') as string
    const formatBlock = formatBlockRaw
      ? formatBlockRaw.toString().toLowerCase().replace(/[<>]/g, '').trim()
      : ''
    const blockquote = formatBlock.includes('blockquote')
    let heading: RichToolbarState['heading'] = 'p'
    if (formatBlock.startsWith('h1')) {
      heading = 'h1'
    } else if (formatBlock.startsWith('h2')) {
      heading = 'h2'
    } else if (formatBlock.startsWith('h3')) {
      heading = 'h3'
    } else if (blockquote) {
      heading = null
    } else if (!formatBlock || formatBlock === 'p' || formatBlock === 'div') {
      heading = 'p'
    }

    let align: RichToolbarState['align'] = 'left'
    if (document.queryCommandState('justifyCenter')) {
      align = 'center'
    } else if (document.queryCommandState('justifyRight')) {
      align = 'right'
    } else if (document.queryCommandState('justifyLeft')) {
      align = 'left'
    }

    const anchor = selection.anchorNode
    const anchorElement =
      anchor instanceof Element ? anchor : anchor?.parentElement
    const link = Boolean(anchorElement?.closest('a'))

    setRichToolbarState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
      blockquote,
      link,
      align,
      heading,
    })
  }

  const applyRichCommand = (command: string, value?: string) => {
    const element = richTextRef.current
    if (!element) {
      return
    }
    element.focus()
    document.execCommand(command, false, value)
    requestAnimationFrame(() => updateRichSelectionState())
  }

  const applyRichHeading = (tag: string) => {
    applyRichCommand('formatBlock', tag)
  }

  const applyRichParagraph = () => {
    applyRichHeading('p')
    applyRichCommand('removeFormat')
    applyRichCommand('unlink')
    setActiveRichColor(null)
  }

  const applyRichColor = (color: string) => {
    applyRichCommand('foreColor', color)
    setActiveRichColor(normalizeColor(color))
  }

  const applyRichFontSize = (size: string) => {
    applyRichCommand('fontSize', size)
  }

  const resetRichFormatting = () => {
    applyRichCommand('removeFormat')
    applyRichCommand('unlink')
    setActiveRichColor(null)
  }

  const openLinkDialog = () => {
    const element = richTextRef.current
    if (!element) {
      return
    }
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0) {
      window.alert('Zaznacz tekst, ktory ma byc linkiem.')
      return
    }
    const range = selection.getRangeAt(0)
    if (!element.contains(range.commonAncestorContainer)) {
      window.alert('Zaznacz tekst w edytorze, zeby dodac link.')
      return
    }
    if (range.collapsed) {
      window.alert('Zaznacz tekst, ktory ma byc linkiem.')
      return
    }
    const anchorNode = selection.anchorNode
    const anchorElement =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
    const existingLink = anchorElement?.closest('a')
    linkSelectionRef.current = range.cloneRange()
    setLinkDraft(existingLink?.getAttribute('href') ?? 'https://')
    setIsLinkDialogOpen(true)
  }

  const closeLinkDialog = () => {
    setIsLinkDialogOpen(false)
    linkSelectionRef.current = null
  }

  const confirmLinkDialog = () => {
    const element = richTextRef.current
    if (!element || !linkSelectionRef.current) {
      return
    }
    const normalized = normalizeLinkUrl(linkDraft)
    if (!normalized) {
      return
    }
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(linkSelectionRef.current)
    element.focus()
    document.execCommand('createLink', false, normalized)
    if (!document.queryCommandState('underline')) {
      document.execCommand('underline')
    }
    document.execCommand('foreColor', false, LINK_COLOR)
    setIsLinkDialogOpen(false)
    linkSelectionRef.current = null
    requestAnimationFrame(() => updateRichSelectionState())
  }

  const handleRichPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const html = event.clipboardData.getData('text/html')
    if (html) {
      const sanitized = sanitizeRichHtml(html)
      document.execCommand('insertHTML', false, sanitized)
      updateRichSelectionState()
      return
    }
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    updateRichSelectionState()
  }

  useEffect(() => {
    if (componentForm.type !== 'text' || textEditorMode !== 'rich') {
      return
    }
    const handleSelectionChange = () => updateRichSelectionState()
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [componentForm.type, textEditorMode])

  const handleRichKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return
    }
    event.preventDefault()
    applyRichCommand(event.shiftKey ? 'outdent' : 'indent')
  }

  const handleRichKeyUp = () => {
    updateRichSelectionState()
  }

  const handleRichClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const link = target?.closest('a')
    const href = link?.getAttribute('href')
    if (!href) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    void openExternalLink(href)
  }

  const handleMarkdownKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') {
      return
    }
    event.preventDefault()
    const element = markdownAreaRef.current
    if (!element) {
      return
    }
    const indent = '  '
    const { value, selectionStart, selectionEnd } = element
    if (event.shiftKey) {
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
      const linePrefix = value.slice(lineStart, lineStart + indent.length)
      if (linePrefix !== indent && linePrefix !== '\t') {
        return
      }
      const removeLength = linePrefix === '\t' ? 1 : indent.length
      const nextValue =
        value.slice(0, lineStart) + value.slice(lineStart + removeLength)
      const nextPos = Math.max(lineStart, selectionStart - removeLength)
      updateMarkdownValue(nextValue, nextPos, nextPos)
      return
    }
    const nextValue =
      value.slice(0, selectionStart) + indent + value.slice(selectionEnd)
    const nextPos = selectionStart + indent.length
    updateMarkdownValue(nextValue, nextPos, nextPos)
  }

  const setEditorMode = (mode: 'rich' | 'markdown') => {
    if (mode === textEditorMode) {
      return
    }
    if (mode === 'markdown' && richTextRef.current) {
      setComponentForm((current) => ({
        ...current,
        markdown: richTextRef.current?.innerHTML ?? current.markdown,
      }))
    }
    setTextEditorMode(mode)
  }

  const handleDownloadMaterials = async (
    lesson: Lesson,
    topic: Topic,
    files: DownloadFile[],
  ) => {
    const zip = new JSZip()
    const electronApi = getElectronApi()
    const missingAssets: string[] = []
    for (const file of files) {
      if (file.kind !== 'asset') {
        const content = 'content' in file ? file.content : ''
        zip.file(`assets/${file.name}`, content)
        continue
      }
      if (electronApi?.readAsset) {
        const data = await electronApi.readAsset(file.id)
        if (data !== null) {
          zip.file(`assets/${file.name}`, data)
        } else {
          missingAssets.push(file.name)
        }
      } else {
        missingAssets.push(file.name)
      }
    }
    if (missingAssets.length) {
      window.alert(
        `Nie udało się dodać plików: ${missingAssets.join(', ')}.`,
      )
    }
    zip.file(
      'meta.json',
      JSON.stringify(
        {
          topic: topic.title,
          lesson: lesson.title,
          number: lesson.number,
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    )
    const blob = await zip.generateAsync({ type: 'blob' })
    await downloadBlob(
      blob,
      `${slugify(topic.title)}_Lekcja_${lesson.number}.zip`,
    )
  }

  const handleExportLesson = async () => {
    if (!activeLesson || !activeTopic) {
      return
    }
    const electronApi = getElectronApi()
    if (!electronApi?.saveLessonExport || !electronApi.readAsset) {
      window.alert(
        'Eksport lekcji jest dostepny tylko w aplikacji desktopowej.',
      )
      return
    }

    const assetIds = Array.from(collectLessonAssetIds(activeLesson))
    const missingAssets: string[] = []
    const zip = new JSZip()
    for (const assetId of assetIds) {
      const data = await electronApi.readAsset(assetId)
      if (data) {
        zip.file(`assets/${assetId}`, data)
      } else {
        missingAssets.push(assetId)
      }
    }

    const payload: LessonExportBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      topic: {
        title: activeTopic.title,
        description: activeTopic.description,
      },
      lesson: activeLesson,
    }
    zip.file('lesson.json', JSON.stringify(payload, null, 2))
    const data = await zip.generateAsync({ type: 'uint8array' })
    const exportName = `${slugify(activeTopic.title)}_Lekcja_${activeLesson.number}`
    const result = await electronApi.saveLessonExport({
      folderName: exportName,
      data,
    })
    if (!result.saved) {
      window.alert('Nie udalo sie zapisac eksportu lekcji.')
      return
    }
    if (missingAssets.length) {
      window.alert(
        `Wyeksportowano lekcje, ale brakuje plikow: ${missingAssets.join(
          ', ',
        )}.`,
      )
    }
    if (result.path) {
      window.alert(`Eksport zapisany w: ${result.path}`)
    } else {
      window.alert('Eksport zapisany w folderze LessonsEksport.')
    }
  }

  const handleImportLesson = async () => {
    const electronApi = getElectronApi()
    if (!electronApi?.openLessonExport || !electronApi.writeAsset) {
      window.alert(
        'Import lekcji jest dostepny tylko w aplikacji desktopowej.',
      )
      return
    }

    const result = await electronApi.openLessonExport()
    if (!result) {
      return
    }

    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(result.data)
    } catch {
      window.alert('Nie udalo sie otworzyc paczki lekcji.')
      return
    }

    const lessonFile = zip.file('lesson.json')
    if (!lessonFile) {
      window.alert('Brak pliku lesson.json w paczce.')
      return
    }

    let payload: LessonExportBundle
    try {
      payload = JSON.parse(await lessonFile.async('string')) as LessonExportBundle
    } catch {
      window.alert('Nie udalo sie odczytac pliku lesson.json.')
      return
    }

    if (!payload?.lesson || !payload?.topic?.title) {
      window.alert('Paczka lekcji jest niepoprawna.')
      return
    }

    const topicKey = normalizeText(payload.topic.title)
    const lessonKey = normalizeText(payload.lesson.title)
    const existingTopicIndex = topics.findIndex(
      (topic) => normalizeText(topic.title) === topicKey,
    )
    const existingLessonIndex =
      existingTopicIndex === -1
        ? -1
        : topics[existingTopicIndex].lessons.findIndex(
            (lesson) => normalizeText(lesson.title) === lessonKey,
          )

    if (existingLessonIndex !== -1) {
      const confirmReplace = window.confirm(
        'Czy chcesz zastapic istniejaca lekcje?',
      )
      if (!confirmReplace) {
        return
      }
    }

    const assetIds = Array.from(collectLessonAssetIds(payload.lesson))
    const assetIdMap: Record<string, string> = {}
    const assetSizeMap: Record<string, number> = {}
    const missingAssets: string[] = []

    for (const assetId of assetIds) {
      const entry = zip.file(`assets/${assetId}`)
      if (!entry) {
        missingAssets.push(assetId)
        continue
      }
      const data = await entry.async('uint8array')
      const stored = await electronApi.writeAsset({ data })
      assetIdMap[assetId] = stored.id
      assetSizeMap[stored.id] = stored.size
    }

    const importedLesson = remapLessonForImport(
      payload.lesson,
      assetIdMap,
      assetSizeMap,
    )

    let replacedLessonId: string | null = null
    let replacedTestIds: string[] = []
    let nextTopics = [...topics]

    if (existingTopicIndex === -1) {
      const newTopic: Topic = {
        id: createId('topic'),
        title: payload.topic.title,
        description: payload.topic.description ?? '',
        lessons: [importedLesson],
      }
      nextTopics = [...topics, newTopic]
    } else {
      const targetTopic = nextTopics[existingTopicIndex]
      if (existingLessonIndex !== -1) {
        replacedLessonId = targetTopic.lessons[existingLessonIndex].id
        replacedTestIds = collectTestIds(
          targetTopic.lessons[existingLessonIndex],
        )
        const nextLessons = [...targetTopic.lessons]
        nextLessons.splice(existingLessonIndex, 1, importedLesson)
        nextTopics[existingTopicIndex] = {
          ...targetTopic,
          lessons: nextLessons,
        }
      } else {
        nextTopics[existingTopicIndex] = {
          ...targetTopic,
          lessons: [...targetTopic.lessons, importedLesson],
        }
      }
    }

    setTopics(nextTopics)
    if (replacedLessonId) {
      setCompletedLessons((current) =>
        current.filter((id) => id !== replacedLessonId),
      )
      setBadgePreview((previous) => {
        const next = { ...previous }
        delete next[replacedLessonId]
        return next
      })
      setLessonAutosaves((current) => {
        const next = { ...current }
        delete next[replacedLessonId]
        delete lastAutosaveRef.current[replacedLessonId]
        return next
      })
      setLessonVersions((current) => {
        const next = { ...current }
        delete next[replacedLessonId]
        return next
      })
      if (replacedTestIds.length) {
        setTestProgress((current) => {
          const next = { ...current }
          replacedTestIds.forEach((id) => delete next[id])
          return next
        })
        setTestResults((current) => {
          const next = { ...current }
          replacedTestIds.forEach((id) => delete next[id])
          return next
        })
        setTestBadgePreview((previous) => {
          const next = { ...previous }
          replacedTestIds.forEach((id) => delete next[id])
          return next
        })
      }
    }
    setActiveLessonId(importedLesson.id)

    if (missingAssets.length) {
      window.alert(
        `Zaimportowano lekcje, ale brakuje plikow: ${missingAssets.join(
          ', ',
        )}.`,
      )
    } else {
      window.alert('Lekcja zostala zaimportowana.')
    }
  }

  const handleTeacherLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (teacherLogin === 'topgun' && teacherPassword === 'topgunpass') {
      setTeacherMode(true)
      setTeacherDialogOpen(false)
      setTeacherError('')
      setTeacherPassword('')
    } else {
      setTeacherError('Niepoprawne dane logowania.')
    }
  }

  const handleTeacherLogout = () => {
    setTeacherMode(false)
    setTeacherLogin('')
    setTeacherPassword('')
    setTeacherError('')
    setTeacherModal(null)
  }

  const teacherPanel = teacherMode ? (
    <div className="teacher-panel">
      <div className="teacher-panel-header">
        <div>
          <h3>Panel nauczyciela</h3>
          <p>Dodawaj tematy, lekcje i komponenty lekcji.</p>
        </div>
        <div className="teacher-actions">
          <button className="ghost" onClick={openAddTopic} type="button">
            Dodaj temat
          </button>
          <button
            className="ghost"
            onClick={() => openAddLesson(activeTopic?.id)}
            disabled={!topics.length}
            type="button"
          >
            Dodaj lekcję
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (activeLesson && activeTopic) {
                openEditLesson(activeLesson, activeTopic.id)
              }
            }}
            disabled={!activeLesson || !activeTopic}
            type="button"
          >
            Edytuj lekcję
          </button>
          <button
            className="ghost"
            onClick={handleExportLesson}
            disabled={!activeLesson || !activeTopic}
            type="button"
          >
            Eksportuj lekcję
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (activeLesson) {
                handleDeleteLesson(activeLesson.id)
              }
            }}
            disabled={!activeLesson}
            type="button"
          >
            Usuń lekcję
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (activeLesson) {
                openAddComponent(activeLesson.id)
              }
            }}
            disabled={!activeLesson}
            type="button"
          >
            Dodaj komponent
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (activeLesson) {
                handleAddRow(activeLesson.id)
              }
            }}
            disabled={!activeLesson}
            type="button"
          >
            Dodaj row
          </button>
        </div>
      </div>
      {activeLesson && (
        <div className="teacher-lesson-meta">
          <div className="teacher-lesson-info">
            <span>
              Autozapis:{' '}
              {activeLessonAutosave
                ? formatDateTime(new Date(activeLessonAutosave.savedAt))
                : 'brak'}
            </span>
            <span>Wersje: {activeLessonVersions.length}/{MAX_LESSON_VERSIONS}</span>
          </div>
          <div className="teacher-lesson-actions">
            <button
              className="ghost small"
              type="button"
              onClick={handleSaveLessonVersion}
              disabled={!activeLesson}
            >
              Zapisz wersję
            </button>
            <button
              className="ghost small"
              type="button"
              onClick={handleRestoreLessonVersion}
              disabled={!activeLessonVersions.length}
            >
              Przywróć wersję
            </button>
            <button
              className="ghost small"
              type="button"
              onClick={handleRestoreLessonAutosave}
              disabled={!activeLessonAutosave}
            >
              Przywróć autozapis
            </button>
          </div>
        </div>
      )}
      <div className="teacher-sections">
        <div className="teacher-section">
          <h4>Tematy</h4>
          <div className="teacher-topic-list">
            {topics.map((topic) => (
              <div className="teacher-topic-item" key={topic.id}>
                <div>
                  <strong>{topic.title}</strong>
                  <span>{topic.lessons.length} lekcji</span>
                </div>
                <div className="teacher-mini-actions">
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() => openAddLesson(topic.id)}
                  >
                    + lekcja
                  </button>
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() => openEditTopic(topic)}
                  >
                    Edytuj
                  </button>
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() => handleDeleteTopic(topic.id)}
                  >
                    Usuń
                  </button>
                </div>
              </div>
            ))}
            {!topics.length && (
              <div className="empty-results">
                Brak tematów. Dodaj pierwszy temat.
              </div>
            )}
          </div>
        </div>
        <div className="teacher-section">
          <div className="teacher-library-header">
            <h4>Biblioteka zasobów</h4>
            <div className="teacher-library-actions">
              <button
                className="ghost small"
                type="button"
                onClick={handlePickLibraryImages}
              >
                + obraz
              </button>
              <button
                className="ghost small"
                type="button"
                onClick={handlePickLibraryVideos}
              >
                + wideo
              </button>
              <button
                className="ghost small"
                type="button"
                onClick={handlePickLibraryFiles}
              >
                + plik
              </button>
            </div>
          </div>
          {assetLibrary.length ? (
            <div className="asset-library-grid">
              {assetLibrary.map((item) => (
                <div className="asset-library-item" key={item.id}>
                  {item.kind === 'image' ? (
                    <ResolvedImage
                      src={`asset:${item.id}`}
                      alt={item.name}
                      className="asset-library-thumb"
                    />
                  ) : (
                    <div className={`asset-library-icon ${item.kind}`}>
                      {item.kind === 'video' ? 'WIDEO' : 'PLIK'}
                    </div>
                  )}
                  <div className="asset-library-meta">
                    <strong>{item.name}</strong>
                    <span>
                      {ASSET_KIND_LABELS[item.kind]}
                      {item.size ? ` • ${formatFileSize(item.size)}` : ''}
                    </span>
                  </div>
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() => removeAssetFromLibrary(item.id)}
                  >
                    Usuń
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-results">
              Brak zasobów. Dodaj obrazy, wideo lub pliki do biblioteki.
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">TG</div>
          <div>
            <p className="brand-kicker">TopGun Academy</p>
            <h1 className="brand-title">Onboarding, który prowadzi do celu</h1>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="ghost student-chip"
            type="button"
            onClick={openStudentPanel}
          >
            Uczeń: {studentName}
          </button>
          <div className="progress-chip">
            Ukończono {completedCount}/{totalLessons}
          </div>
          <button className="ghost" type="button" onClick={handleImportLesson}>
            Importuj lekcję
          </button>
          {teacherMode ? (
            <button className="secondary" onClick={handleTeacherLogout}>
              Wyloguj nauczyciela
            </button>
          ) : (
            <button
              className="secondary"
              onClick={() => setTeacherDialogOpen(true)}
            >
              Nauczyciel
            </button>
          )}
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-head">
            <div className="search-field">
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Szukaj lekcji i treści"
                aria-label="Szukaj lekcji i treści"
              />
            </div>
            <div className="sidebar-meta">
              <span>
                {teacherMode ? 'Tryb nauczyciela' : 'Tryb ucznia'}
              </span>
              <span>
                Wyniki:{' '}
                {normalizedSearch
                  ? filteredTopics.reduce(
                      (count, topic) => count + topic.lessons.length,
                      0,
                    )
                  : totalLessons}
              </span>
            </div>
          </div>

          <div className="sidebar-list">
            {filteredTopics.map((topic) => (
              <div className="topic-block" key={topic.id}>
                <div className="topic-title">{highlightMatches(topic.title)}</div>
                <p className="topic-description">{topic.description}</p>
                <div className="lesson-list">
                  {topic.lessons.map((lesson, index) => {
                    const completed = isLessonCompleted(lesson.id)
                    const active = lesson.id === activeLessonId
                    return (
                      <button
                        key={lesson.id}
                        className={`lesson-item ${
                          active ? 'active' : ''
                        }`}
                        style={
                          {
                            '--delay': `${index * 40}ms`,
                          } as CSSProperties
                        }
                        onClick={() => handleSelectLesson(lesson.id)}
                      >
                        <span className="lesson-title">
                          {highlightMatches(lesson.title)}
                        </span>
                        <span className="lesson-meta">
                          Lekcja {lesson.number} • {lesson.duration}
                        </span>
                        <span
                          className={`lesson-status ${
                            completed ? 'done' : 'todo'
                          }`}
                        >
                          {completed ? '✓ Ukończona' : 'Do zrobienia'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {!filteredTopics.length && (
              <div className="empty-results">
                Brak wyników. Zmień zapytanie lub usuń filtry.
              </div>
            )}
          </div>
        </aside>

        <main className="lesson-panel">
          {activeLesson && activeTopic ? (
            <div className="lesson-view">
              <header className="lesson-header">
                <div className="lesson-tags">
                  <span className="tag">{activeTopic.title}</span>
                  <span className="tag">{activeLesson.difficulty}</span>
                  <span className="tag">{activeLesson.duration}</span>
                </div>
                <h2>{activeLesson.title}</h2>
                <p className="lesson-summary">{activeLesson.summary}</p>
                {isLessonCompleted(activeLesson.id) && (
                  <div className="lesson-completed-banner">
                    Lekcja ukończona • Odznaka gotowa do pobrania
                  </div>
                )}
              </header>

              <div className="lesson-grid">
                {activeLesson.rows.map((row, rowIndex) => (
                  <div
                    className="lesson-row"
                    key={row.id}
                    style={
                      {
                        '--delay': `${rowIndex * 60}ms`,
                      } as CSSProperties
                    }
                  >
                    {row.columns.map((column) => {
                      if (column.type === 'text') {
                        return (
                          <div
                            key={column.id}
                            className={`lesson-card span-${column.span}`}
                          >
                            {teacherMode && activeLesson && (
                              <div className="card-toolbar">
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    openEditComponent(activeLesson.id, column)
                                  }
                                >
                                  Edytuj
                                </button>
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    handleDeleteComponent(
                                      activeLesson.id,
                                      column.id,
                                    )
                                  }
                                >
                                  Usuń
                                </button>
                              </div>
                            )}
                            <MarkdownBlock markdown={column.markdown} />
                          </div>
                        )
                      }
                      if (column.type === 'video') {
                        return (
                          <div
                            key={column.id}
                            className={`lesson-card span-${column.span}`}
                          >
                            {teacherMode && activeLesson && (
                              <div className="card-toolbar">
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    openEditComponent(activeLesson.id, column)
                                  }
                                >
                                  Edytuj
                                </button>
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    handleDeleteComponent(
                                      activeLesson.id,
                                      column.id,
                                    )
                                  }
                                >
                                  Usuń
                                </button>
                              </div>
                            )}
                            <div className="video-block">
                              <div className="video-header">
                                <h3>{column.title}</h3>
                                {column.description && (
                                  <p>{column.description}</p>
                                )}
                              </div>
                              {column.embedUrl ? (
                                <iframe
                                  title={column.title}
                                  src={column.embedUrl}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                  loading="lazy"
                                />
                              ) : column.assetId ? (
                                <ResolvedVideo
                                  src={`asset:${column.assetId}`}
                                  title={column.title}
                                />
                              ) : (
                                <div className="video-placeholder">
                                  Wideo zostanie wstawione przez nauczyciela.
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      }
                      if (column.type === 'image') {
                        return (
                          <div
                            key={column.id}
                            className={`lesson-card span-${column.span}`}
                          >
                            {teacherMode && activeLesson && (
                              <div className="card-toolbar">
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    openEditComponent(activeLesson.id, column)
                                  }
                                >
                                  Edytuj
                                </button>
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    handleDeleteComponent(
                                      activeLesson.id,
                                      column.id,
                                    )
                                  }
                                >
                                  Usuń
                                </button>
                              </div>
                            )}
                            <div className="image-grid">
                              {column.images.map((image) => (
                                <button
                                  key={image.src}
                                  className="image-tile"
                                  onClick={() => setLightboxImage(image)}
                                  type="button"
                                >
                                  <ResolvedImage
                                    src={image.src}
                                    alt={image.alt}
                                  />
                                  {image.caption && (
                                    <span>{image.caption}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      if (column.type === 'download') {
                        return (
                          <div
                            key={column.id}
                            className={`lesson-card span-${column.span}`}
                          >
                            {teacherMode && activeLesson && (
                              <div className="card-toolbar">
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    openEditComponent(activeLesson.id, column)
                                  }
                                >
                                  Edytuj
                                </button>
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    handleDeleteComponent(
                                      activeLesson.id,
                                      column.id,
                                    )
                                  }
                                >
                                  Usuń
                                </button>
                              </div>
                            )}
                            <div className="download-block">
                              <div>
                                <h3>{column.label}</h3>
                                <p>
                                  Pliki zostaną spakowane do ZIP:
                                  {` ${activeTopic.title}_Lekcja_${activeLesson.number}.zip`}
                                </p>
                                {Array.isArray(column.files) &&
                                column.files.length ? (
                                  <ul className="download-list">
                                    {column.files.map((file, index) => (
                                      <li
                                        key={`${file.name}-${file.kind}-${index}`}
                                      >
                                        <span>{file.name}</span>
                                        {file.kind === 'asset' ? (
                                          <em>{formatFileSize(file.size) || 'plik'}</em>
                                        ) : (
                                          <em>tekst</em>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p>Brak materiałów do pobrania.</p>
                                )}
                              </div>
                              <button
                                className="primary"
                                onClick={() =>
                                  handleDownloadMaterials(
                                    activeLesson,
                                    activeTopic,
                                    Array.isArray(column.files) ? column.files : [],
                                  )
                                }
                              >
                                Pobierz materiały
                              </button>
                            </div>
                          </div>
                        )
                      }
                      if (column.type === 'test') {
                        const progress = testProgress[column.id]
                        const result = testResults[column.id]
                        const questionCount = column.questions.length
                        const answeredCount = progress
                          ? Object.values(progress.answers).filter(
                              (answers) => answers.length > 0,
                            ).length
                          : 0
                        return (
                          <div
                            key={column.id}
                            className={`lesson-card span-${column.span}`}
                          >
                            {teacherMode && activeLesson && (
                              <div className="card-toolbar">
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    openEditComponent(activeLesson.id, column)
                                  }
                                >
                                  Edytuj
                                </button>
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() =>
                                    handleDeleteComponent(
                                      activeLesson.id,
                                      column.id,
                                    )
                                  }
                                >
                                  Usuń
                                </button>
                              </div>
                            )}
                            <div className="test-card">
                              <div>
                                <h3>{column.title}</h3>
                                <p>
                                  Pytan: {questionCount}
                                  {result
                                    ? ` • Wynik: ${result.score}/${result.total}`
                                    : progress
                                      ? ` • Postep: ${answeredCount}/${questionCount}`
                                      : ''}
                                </p>
                              </div>
                              <div className="test-actions">
                                {result ? (
                                  <>
                                    <button
                                      className="ghost"
                                      type="button"
                                      onClick={() => handleViewTestResult(column.id)}
                                    >
                                      Zobacz wynik
                                    </button>
                                    <button
                                      className="primary"
                                      type="button"
                                      onClick={() => {
                                        handleResetTest(column.id)
                                        handleStartTest(column)
                                      }}
                                    >
                                      Rozwiaz jeszcze raz
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className="primary"
                                    type="button"
                                    onClick={() => handleStartTest(column)}
                                  >
                                    {progress ? 'Kontynuuj test' : 'Rozwiaz test'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })}
                  </div>
                ))}
              </div>

              <div className="lesson-footer">
                <div className="lesson-actions">
                  {isLessonCompleted(activeLesson.id) ? (
                    <button className="ghost" onClick={handleResetLesson}>
                      Zrób jeszcze raz
                    </button>
                  ) : (
                    <button className="primary" onClick={handleCompleteLesson}>
                      Zrozumiałem lekcję
                    </button>
                  )}
                  <span className="helper-text">
                    Status nie blokuje innych lekcji.
                  </span>
                </div>
                {badgePreview[activeLesson.id] && (
                  <div className="badge-preview">
                    <img
                      src={badgePreview[activeLesson.id]}
                      alt="Podgląd odznaki"
                    />
                    <div>
                      <h4>Odznaka wygenerowana</h4>
                      <p>
                        Zapisz ją lokalnie lub wygeneruj ponownie po resetowaniu
                        postępu.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {teacherPanel}
            </div>
          ) : (
            <div className="empty-lesson">
              <p>Wybierz lekcję z lewej strony, aby rozpocząć naukę.</p>
              {teacherPanel && (
                <div className="teacher-panel-wrapper">{teacherPanel}</div>
              )}
            </div>
          )}
        </main>
      </div>

      {studentPanelOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-large student-panel">
            <div className="modal-header">
              <h3>Panel ucznia</h3>
              <button
                className="ghost"
                type="button"
                onClick={() => setStudentPanelOpen(false)}
              >
                Zamknij
              </button>
            </div>
            <div className="student-panel-body">
              <form
                className="student-profile"
                onSubmit={handleSaveStudentProfile}
              >
                <label>
                  Imię ucznia
                  <div className="student-name-row">
                    <input
                      value={studentDraftName}
                      onChange={(event) => setStudentDraftName(event.target.value)}
                      placeholder="Twoje imię"
                    />
                    <button className="primary small" type="submit">
                      Zapisz ✓
                    </button>
                  </div>
                </label>
              </form>
              <div className="student-progress">
                <div className="student-progress-meta">
                  <strong>Postęp</strong>
                  <span>
                    {completedCount}/{totalLessons} • {progressPercent}%
                  </span>
                </div>
                <div className="progress-bar">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
              <div className="student-badges">
                <h4>Odznaki z lekcji</h4>
                {completedLessonList.length ? (
                  <div className="student-badge-list">
                    {completedLessonList.map(({ lesson, topicTitle }) => (
                      <div className="student-badge-item" key={lesson.id}>
                        <div>
                          <strong>{lesson.title}</strong>
                          <span>
                            {topicTitle} • Lekcja {lesson.number}
                          </span>
                        </div>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => handleDownloadLessonBadge(lesson)}
                        >
                          Pobierz odznakę
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Brak ukończonych lekcji.</p>
                )}
              </div>
              <div className="student-badges">
                <h4>Odznaki z testów</h4>
                {testResultsList.length ? (
                  <div className="student-badge-list">
                    {testResultsList.map(({ test, lessonTitle, result }) => (
                      <div className="student-badge-item" key={test.id}>
                        <div>
                          <strong>{test.title}</strong>
                          <span>
                            {lessonTitle} • Wynik {result.score}/{result.total}
                          </span>
                        </div>
                        <div className="student-badge-actions">
                          <span className="student-badge-date">
                            {formatDateTime(new Date(result.completedAt))}
                          </span>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => handleDownloadTestBadge(test, result)}
                          >
                            Pobierz odznakę
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Brak ukończonych testów.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {versionDialogOpen && activeLesson && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-large version-panel">
            <div className="modal-header">
              <h3>Wersje lekcji: {activeLesson.title}</h3>
              <button
                className="ghost"
                type="button"
                onClick={() => setVersionDialogOpen(false)}
              >
                Zamknij
              </button>
            </div>
            <div className="version-panel-body">
              {orderedLessonVersions.length ? (
                <div className="version-list">
                  {orderedLessonVersions.map((snapshot, index) => {
                    const stats = getLessonStats(snapshot.lesson)
                    const diffLines = buildLessonDiffLines(
                      snapshot.lesson,
                      activeLesson,
                    )
                    const versionLabel =
                      index === 0
                        ? 'Najnowsza wersja'
                        : index === 1
                          ? 'Poprzednia wersja'
                          : 'Starsza wersja'
                    return (
                      <div className="version-card" key={snapshot.savedAt}>
                        <div className="version-card-header">
                          <div>
                            <strong>{versionLabel}</strong>
                            <span>
                              {formatDateTime(new Date(snapshot.savedAt))}
                            </span>
                          </div>
                          <div className="version-card-actions">
                            <button
                              className="ghost small danger"
                              type="button"
                              onClick={() => handleDeleteLessonVersion(snapshot.savedAt)}
                            >
                              Usuń
                            </button>
                            <button
                              className="primary small"
                              type="button"
                              onClick={() => {
                                restoreLessonSnapshot(snapshot)
                                setVersionDialogOpen(false)
                              }}
                            >
                              Przywróć
                            </button>
                          </div>
                        </div>
                        <div className="version-card-meta">
                          Wiersze {stats.rows} • Komponenty {stats.components} •
                          Testy {stats.byType.test} • Pytania {stats.questions}
                        </div>
                        <ul className="version-card-diff">
                          {diffLines.map((line, lineIndex) => (
                            <li key={`${snapshot.savedAt}-${lineIndex}`}>
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p>Brak zapisanych wersji.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {teacherDialogOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3>Logowanie nauczyciela</h3>
              <button
                className="ghost"
                onClick={() => setTeacherDialogOpen(false)}
                type="button"
              >
                Zamknij
              </button>
            </div>
            <form onSubmit={handleTeacherLogin} className="modal-body">
              <label>
                Login
                <input
                  value={teacherLogin}
                  onChange={(event) => {
                    setTeacherLogin(event.target.value)
                    if (teacherError) {
                      setTeacherError('')
                    }
                  }}
                />
              </label>
              <label>
                Hasło
                <input
                  type="password"
                  value={teacherPassword}
                  onChange={(event) => {
                    setTeacherPassword(event.target.value)
                    if (teacherError) {
                      setTeacherError('')
                    }
                  }}
                />
              </label>
              {teacherError && <p className="error">{teacherError}</p>}
              <button className="primary" type="submit">
                Zaloguj
              </button>
            </form>
          </div>
        </div>
      )}

      {teacherModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div
            className={`modal ${
              teacherModal.type === 'add-component' ||
              teacherModal.type === 'edit-component'
                ? 'modal-large'
                : ''
            } ${isModalExpanded ? 'modal-expanded' : ''}`.trim()}
          >
            <div className="modal-header">
              <h3>
                {teacherModal.type === 'add-topic' && 'Dodaj temat'}
                {teacherModal.type === 'edit-topic' && 'Edytuj temat'}
                {teacherModal.type === 'add-lesson' && 'Dodaj lekcję'}
                {teacherModal.type === 'edit-lesson' && 'Edytuj lekcję'}
                {teacherModal.type === 'add-component' && 'Dodaj komponent'}
                {teacherModal.type === 'edit-component' && 'Edytuj komponent'}
              </h3>
              <div className="modal-header-actions">
                {(teacherModal.type === 'add-component' ||
                  teacherModal.type === 'edit-component') && (
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() => setIsModalExpanded((value) => !value)}
                  >
                    {isModalExpanded ? 'Zmniejsz' : 'Powieksz'}
                  </button>
                )}
                <button
                  className="ghost"
                  onClick={closeTeacherModal}
                  type="button"
                >
                  Zamknij
                </button>
              </div>
            </div>

            {(teacherModal.type === 'add-topic' ||
              teacherModal.type === 'edit-topic') && (
              <form className="modal-body" onSubmit={handleSaveTopic}>
                <label>
                  Tytuł tematu
                  <input
                    value={topicForm.title}
                    onChange={(event) =>
                      setTopicForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Np. B2B Tester"
                  />
                </label>
                <label>
                  Opis tematu
                  <textarea
                    rows={3}
                    value={topicForm.description}
                    onChange={(event) =>
                      setTopicForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Krótki opis tematu"
                  />
                </label>
                <button className="primary" type="submit">
                  Zapisz temat
                </button>
              </form>
            )}

            {(teacherModal.type === 'add-lesson' ||
              teacherModal.type === 'edit-lesson') && (
              <form className="modal-body" onSubmit={handleSaveLesson}>
                <label>
                  Temat
                  <select
                    value={lessonForm.topicId}
                    onChange={(event) =>
                      setLessonForm((current) => ({
                        ...current,
                        topicId: event.target.value,
                      }))
                    }
                    disabled={teacherModal.type === 'edit-lesson'}
                  >
                    {topics.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Numer lekcji
                  <input
                    type="number"
                    min={1}
                    value={lessonForm.number}
                    onChange={(event) =>
                      setLessonForm((current) => ({
                        ...current,
                        number: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Tytuł lekcji
                  <input
                    value={lessonForm.title}
                    onChange={(event) =>
                      setLessonForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Np. Start misji i narzędzia"
                  />
                </label>
                <label>
                  Czas trwania
                  <input
                    value={lessonForm.duration}
                    onChange={(event) =>
                      setLessonForm((current) => ({
                        ...current,
                        duration: event.target.value,
                      }))
                    }
                    placeholder="Np. 25 min"
                  />
                </label>
                <label>
                  Poziom trudności
                  <select
                    value={lessonForm.difficulty}
                    onChange={(event) =>
                      setLessonForm((current) => ({
                        ...current,
                        difficulty: event.target.value,
                      }))
                    }
                  >
                    <option value="Podstawy">Podstawy</option>
                    <option value="Średnio zaawansowane">
                      Średnio zaawansowane
                    </option>
                    <option value="Zaawansowane">Zaawansowane</option>
                  </select>
                </label>
                <label>
                  Podsumowanie
                  <textarea
                    rows={3}
                    value={lessonForm.summary}
                    onChange={(event) =>
                      setLessonForm((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                    placeholder="Krótki opis celu lekcji"
                  />
                </label>
                <button className="primary" type="submit">
                  Zapisz lekcję
                </button>
              </form>
            )}

            {(teacherModal.type === 'add-component' ||
              teacherModal.type === 'edit-component') && (
              <form className="modal-body" onSubmit={handleSaveComponent}>
                <label>
                  Typ komponentu
                  <select
                    value={componentForm.type}
                    onChange={(event) =>
                      setComponentForm((current) => ({
                        ...current,
                        type: event.target.value as LessonComponent['type'],
                        testTitle:
                          event.target.value === 'test' && !current.testTitle
                            ? activeLesson
                              ? `Test: ${activeLesson.title}`
                              : 'Test'
                            : current.testTitle,
                        testQuestions:
                          event.target.value === 'test' &&
                          !current.testQuestions.length
                            ? [createTestQuestion()]
                            : current.testQuestions,
                      }))
                    }
                  >
                    <option value="text">Tekst (Markdown)</option>
                    <option value="video">Wideo</option>
                    <option value="image">Obraz</option>
                    <option value="download">Pliki do pobrania</option>
                    <option value="test">Test</option>
                  </select>
                </label>
                <label>
                  Szerokość (kolumny)
                  <select
                    value={componentForm.span}
                    onChange={(event) =>
                      setComponentForm((current) => ({
                        ...current,
                        span: Number(event.target.value) as ColumnSpan,
                      }))
                    }
                  >
                    <option value={1}>1 kolumna</option>
                    <option value={2}>2 kolumny</option>
                    <option value={4}>4 kolumny</option>
                  </select>
                </label>

                {componentForm.type === 'text' && (
                  <div className="markdown-editor">
                    <div className="editor-toggle">
                      <button
                        className={`ghost small ${
                          textEditorMode === 'rich' ? 'active' : ''
                        }`}
                        type="button"
                        onClick={() => setEditorMode('rich')}
                      >
                        WYSIWYG
                      </button>
                      <button
                        className={`ghost small ${
                          textEditorMode === 'markdown' ? 'active' : ''
                        }`}
                        type="button"
                        onClick={() => setEditorMode('markdown')}
                      >
                        Markdown
                      </button>
                    </div>

                    {textEditorMode === 'rich' ? (
                      <>
                        <div className="rich-toolbar">
                          <button
                            className={`ghost small ${
                              richToolbarState.heading === 'h1' ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichHeading('h1')}
                            title="Nagłówek H1"
                          >
                            H1
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.heading === 'h2' ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichHeading('h2')}
                            title="Nagłówek H2"
                          >
                            H2
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.heading === 'h3' ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichHeading('h3')}
                            title="Nagłówek H3"
                          >
                            H3
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.heading === 'p' ? 'active' : ''
                            }`}
                            type="button"
                            onClick={applyRichParagraph}
                            title="Tekst zwykły"
                          >
                            Tekst
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => applyRichFontSize('4')}
                            title="Większa czcionka"
                          >
                            A+
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => applyRichFontSize('3')}
                            title="Normalna czcionka"
                          >
                            A-
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.bold ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichCommand('bold')}
                            title="Pogrubienie"
                          >
                            B
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.italic ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichCommand('italic')}
                            title="Kursywa"
                          >
                            I
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.underline ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichCommand('underline')}
                            title="Podkreślenie"
                          >
                            U
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.unorderedList ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichCommand('insertUnorderedList')}
                            title="Lista punktowana"
                          >
                            • lista
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.orderedList ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichCommand('insertOrderedList')}
                            title="Lista numerowana"
                          >
                            1. lista
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.blockquote ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichCommand('formatBlock', 'blockquote')}
                            title="Cytat"
                          >
                            Cytat
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.link ? 'active' : ''
                            }`}
                            type="button"
                            onClick={openLinkDialog}
                            title="Link"
                          >
                            Link
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.align === 'left' ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichCommand('justifyLeft')}
                            title="Wyrownaj do lewej"
                          >
                            L
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.align === 'center' ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichCommand('justifyCenter')}
                            title="Wyrownaj do srodka"
                          >
                            S
                          </button>
                          <button
                            className={`ghost small ${
                              richToolbarState.align === 'right' ? 'active' : ''
                            }`}
                            type="button"
                            onClick={() => applyRichCommand('justifyRight')}
                            title="Wyrownaj do prawej"
                          >
                            P
                          </button>
                          <div className="rich-color-picker">
                            <span className="rich-color-label">Kolor</span>
                            {RICH_TEXT_COLORS.map((color) => {
                              const normalized =
                                normalizeColor(color.value) ??
                                color.value.toLowerCase()
                              const isActive = activeRichColor === normalized
                              return (
                                <button
                                  key={color.value}
                                  className={`color-swatch ${
                                    isActive ? 'active' : ''
                                  }`}
                                  type="button"
                                  style={{ backgroundColor: color.value }}
                                  onClick={() => applyRichColor(color.value)}
                                  title={color.label}
                                  aria-label={`Kolor ${color.label}`}
                                />
                              )
                            })}
                          </div>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={resetRichFormatting}
                            title="Usun formatowanie"
                          >
                            Reset
                          </button>
                        </div>
                        <div
                          ref={richTextRef}
                          className="rich-editor"
                          contentEditable
                          suppressContentEditableWarning
                          onPaste={handleRichPaste}
                          onKeyDown={handleRichKeyDown}
                          onKeyUp={handleRichKeyUp}
                          onClick={handleRichClick}
                          data-placeholder="Wpisz treść lekcji..."
                        />
                        {isLinkDialogOpen && (
                          <div className="link-dialog">
                            <div className="link-dialog-card">
                              <label>
                                Adres URL
                                <input
                                  value={linkDraft}
                                  onChange={(event) =>
                                    setLinkDraft(event.target.value)
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      confirmLinkDialog()
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault()
                                      closeLinkDialog()
                                    }
                                  }}
                                  placeholder="https://..."
                                />
                              </label>
                              <div className="link-dialog-actions">
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={closeLinkDialog}
                                >
                                  Anuluj
                                </button>
                                <button
                                  className="primary"
                                  type="button"
                                  onClick={confirmLinkDialog}
                                >
                                  Zapisz
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="md-toolbar">
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => applyLinePrefix('# ')}
                            title="Nagłówek H1"
                          >
                            H1
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => applyLinePrefix('## ')}
                            title="Nagłówek H2"
                          >
                            H2
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => applyLinePrefix('### ')}
                            title="Nagłówek H3"
                          >
                            H3
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => wrapSelection('**', '**', 'pogrubienie')}
                            title="Pogrubienie"
                          >
                            B
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => wrapSelection('*', '*', 'kursywa')}
                            title="Kursywa"
                          >
                            I
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => wrapSelection('`', '`', 'kod')}
                            title="Kod inline"
                          >
                            {'</>'}
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => wrapSelection('```\n', '\n```', 'kod')}
                            title="Blok kodu"
                          >
                            Code
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => applyLinePrefix('- ')}
                            title="Lista punktowana"
                          >
                            • lista
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => applyLinePrefix('1. ', true)}
                            title="Lista numerowana"
                          >
                            1. lista
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => applyLinePrefix('> ')}
                            title="Cytat"
                          >
                            Cytat
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={insertLink}
                            title="Link"
                          >
                            Link
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() =>
                              wrapSelection(
                                '<span class=\"md-accent\">',
                                '</span>',
                                'akcent',
                              )
                            }
                            title="Kolor akcentu"
                          >
                            Kolor
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() =>
                              wrapSelection(
                                '<span class=\"md-big\">',
                                '</span>',
                                'większy tekst',
                              )
                            }
                            title="Większy tekst"
                          >
                            A+
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={insertSeparator}
                            title="Separator"
                          >
                            ---
                          </button>
                        </div>
                        <details className="md-help">
                          <summary>Legenda Markdown</summary>
                          <div className="md-help-body">
                            <p>
                              Wklejony tekst zachowuje akapity. Formatowanie z
                              Worda moze wymagac korekty.
                            </p>
                            <div className="md-help-grid">
                              <code># Naglowek</code>
                              <code>**pogrubienie**</code>
                              <code>*kursywa*</code>
                              <code>- lista</code>
                              <code>1. lista</code>
                              <code>&gt; cytat</code>
                              <code>[tekst](https://...)</code>
                              <code>```blok kodu```</code>
                              <code>
                                &lt;span class=&quot;md-accent&quot;&gt;kolor&lt;/span&gt;
                              </code>
                            </div>
                          </div>
                        </details>
                        <label>
                          Treść Markdown
                          <textarea
                            ref={markdownAreaRef}
                            rows={7}
                            value={componentForm.markdown}
                            onChange={(event) =>
                              setComponentForm((current) => ({
                                ...current,
                                markdown: event.target.value,
                              }))
                            }
                            onKeyDown={handleMarkdownKeyDown}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}

                {componentForm.type === 'video' && (
                  <>
                    <label>
                      Tytuł wideo
                      <input
                        value={componentForm.title}
                        onChange={(event) =>
                          setComponentForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Opis
                      <textarea
                        rows={3}
                        value={componentForm.description}
                        onChange={(event) =>
                          setComponentForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Embed URL (YouTube / Vimeo)
                      <input
                        value={componentForm.embedUrl}
                        onChange={(event) =>
                          setComponentForm((current) => ({
                            ...current,
                            embedUrl: event.target.value,
                          }))
                        }
                        placeholder="https://www.youtube.com/embed/..."
                      />
                    </label>
                    <div className="asset-box">
                      <div className="asset-header">
                        <span>Wideo z dysku</span>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={handlePickVideoAsset}
                        >
                          Dodaj wideo
                        </button>
                      </div>
                      {componentForm.videoAsset ? (
                        <div className="asset-item">
                          <div>
                            <strong>{componentForm.videoAsset.name}</strong>
                            {componentForm.videoAsset.size && (
                              <span>
                                {formatFileSize(componentForm.videoAsset.size)}
                              </span>
                            )}
                          </div>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={handleRemoveVideoAsset}
                          >
                            Usuń
                          </button>
                        </div>
                      ) : (
                        <p>Brak dołączonego wideo.</p>
                      )}
                      {libraryVideos.length ? (
                        <div className="asset-library">
                          <p className="asset-library-title">
                            Biblioteka wideo
                          </p>
                          <div className="asset-library-list">
                            {libraryVideos.map((item) => {
                              const selected =
                                componentForm.videoAsset?.id === item.id
                              return (
                                <div className="asset-library-item" key={item.id}>
                                  <div className="asset-library-icon video">WIDEO</div>
                                  <div className="asset-library-meta">
                                    <strong>{item.name}</strong>
                                    <span>
                                      {formatFileSize(item.size) || 'wideo'}
                                    </span>
                                  </div>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => useLibraryVideoAsset(item)}
                                    disabled={selected}
                                  >
                                    {selected ? 'Wybrane' : 'Użyj'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                {componentForm.type === 'image' && (
                  <>
                    <label>
                      Obrazy (linia: URL | opis | podpis)
                      <textarea
                        rows={5}
                        value={componentForm.imagesText}
                        onChange={(event) =>
                          setComponentForm((current) => ({
                            ...current,
                            imagesText: event.target.value,
                          }))
                        }
                        placeholder="/system-map.svg | Schemat | Opcjonalny podpis"
                      />
                    </label>
                    <div className="asset-box">
                      <div className="asset-header">
                        <span>Obrazy z dysku</span>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={handlePickImageAssets}
                        >
                          Dodaj obrazy
                        </button>
                      </div>
                      {componentForm.imageAssets.length ? (
                        <div className="image-asset-grid">
                          {componentForm.imageAssets.map((file) => (
                            <div className="image-asset-item" key={file.id}>
                              <ResolvedImage
                                src={`asset:${file.id}`}
                                alt={file.alt || file.name}
                                className="image-asset-thumb"
                              />
                              <div className="image-asset-meta">
                                <strong>{file.name}</strong>
                                {file.size && (
                                  <span>{formatFileSize(file.size)}</span>
                                )}
                                <input
                                  value={file.alt}
                                  onChange={(event) =>
                                    setComponentForm((current) => ({
                                      ...current,
                                      imageAssets: current.imageAssets.map(
                                        (asset) =>
                                          asset.id === file.id
                                            ? {
                                                ...asset,
                                                alt: event.target.value,
                                              }
                                            : asset,
                                      ),
                                    }))
                                  }
                                  placeholder="Opis (alt)"
                                />
                                <input
                                  value={file.caption}
                                  onChange={(event) =>
                                    setComponentForm((current) => ({
                                      ...current,
                                      imageAssets: current.imageAssets.map(
                                        (asset) =>
                                          asset.id === file.id
                                            ? {
                                                ...asset,
                                                caption: event.target.value,
                                              }
                                            : asset,
                                      ),
                                    }))
                                  }
                                  placeholder="Podpis (opcjonalnie)"
                                />
                              </div>
                              <button
                                className="ghost small"
                                type="button"
                                onClick={() => handleRemoveImageAsset(file.id)}
                              >
                                Usuń
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>Brak dołączonych obrazów.</p>
                      )}
                      {libraryImages.length ? (
                        <div className="asset-library">
                          <p className="asset-library-title">
                            Biblioteka obrazów
                          </p>
                          <div className="asset-library-list">
                            {libraryImages.map((item) => {
                              const selected = componentForm.imageAssets.some(
                                (file) => file.id === item.id,
                              )
                              return (
                                <div className="asset-library-item" key={item.id}>
                                  <ResolvedImage
                                    src={`asset:${item.id}`}
                                    alt={item.name}
                                    className="asset-library-thumb"
                                  />
                                  <div className="asset-library-meta">
                                    <strong>{item.name}</strong>
                                    <span>
                                      {formatFileSize(item.size) || 'obraz'}
                                    </span>
                                  </div>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => addLibraryImageAsset(item)}
                                    disabled={selected}
                                  >
                                    {selected ? 'Dodany' : 'Dodaj'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                {componentForm.type === 'download' && (
                  <>
                    <label>
                      Etykieta sekcji
                      <input
                        value={componentForm.downloadLabel}
                        onChange={(event) =>
                          setComponentForm((current) => ({
                            ...current,
                            downloadLabel: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Pliki (linia: Nazwa | Treść)
                      <textarea
                        rows={5}
                        value={componentForm.filesText}
                        onChange={(event) =>
                          setComponentForm((current) => ({
                            ...current,
                            filesText: event.target.value,
                          }))
                        }
                        placeholder="Checklist.txt | 1. Sprawdź dostęp..."
                      />
                    </label>
                    <div className="asset-box">
                      <div className="asset-header">
                        <span>Pliki z dysku</span>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={handlePickDownloadAssets}
                        >
                          Dodaj pliki
                        </button>
                      </div>
                      {componentForm.assetFiles.length ? (
                        <div className="asset-list">
                          {componentForm.assetFiles.map((file) => (
                            <div className="asset-item" key={file.id}>
                              <div>
                                <strong>{file.name}</strong>
                                {file.size && (
                                  <span>{formatFileSize(file.size)}</span>
                                )}
                              </div>
                              <button
                                className="ghost small"
                                type="button"
                                onClick={() => handleRemoveAsset(file.id)}
                              >
                                Usuń
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>Brak dołączonych plików.</p>
                      )}
                      {libraryFiles.length ? (
                        <div className="asset-library">
                          <p className="asset-library-title">
                            Biblioteka plików
                          </p>
                          <div className="asset-library-list">
                            {libraryFiles.map((item) => {
                              const selected = componentForm.assetFiles.some(
                                (file) => file.id === item.id,
                              )
                              return (
                                <div className="asset-library-item" key={item.id}>
                                  <div className="asset-library-icon file">PLIK</div>
                                  <div className="asset-library-meta">
                                    <strong>{item.name}</strong>
                                    <span>
                                      {formatFileSize(item.size) || 'plik'}
                                    </span>
                                  </div>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => addLibraryDownloadFile(item)}
                                    disabled={selected}
                                  >
                                    {selected ? 'Dodany' : 'Dodaj'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                {componentForm.type === 'test' && (
                  <>
                    <label>
                      Nazwa testu
                      <input
                        value={componentForm.testTitle}
                        onChange={(event) =>
                          setComponentForm((current) => ({
                            ...current,
                            testTitle: event.target.value,
                          }))
                        }
                        placeholder="Test: nazwa lekcji"
                      />
                    </label>
                    <div className="test-editor">
                      <div className="test-editor-header">
                        <h4>Pytania</h4>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={handleAddTestQuestion}
                        >
                          Dodaj pytanie
                        </button>
                      </div>
                      {componentForm.testQuestions.length ? (
                        <div className="test-question-list">
                          {componentForm.testQuestions.map((question, index) => (
                            <div className="test-question-card" key={question.id}>
                              <div className="test-question-head">
                                <strong>Pytanie {index + 1}</strong>
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() => handleRemoveTestQuestion(question.id)}
                                >
                                  Usuń
                                </button>
                              </div>
                              <label>
                                Treść pytania
                                <textarea
                                  rows={3}
                                  value={question.prompt}
                                  onChange={(event) =>
                                    updateTestQuestion(question.id, (current) => ({
                                      ...current,
                                      prompt: event.target.value,
                                    }))
                                  }
                                  placeholder="Wpisz pytanie..."
                                />
                              </label>
                              <div className="question-content">
                                <div className="question-content-header">
                                  <span>Materialy pytania</span>
                                  <div className="question-content-actions">
                                    <button
                                      className="ghost small"
                                      type="button"
                                      onClick={() => handleAddQuestionRow(question.id)}
                                    >
                                      Dodaj row
                                    </button>
                                    <button
                                      className="ghost small"
                                      type="button"
                                      onClick={() => startQuestionComponentEdit(question.id)}
                                    >
                                      Dodaj blok
                                    </button>
                                  </div>
                                </div>
                                {question.rows.length ? (
                                  <div className="question-grid">
                                    {question.rows.map((row) => (
                                      <div className="question-row" key={row.id}>
                                        {row.columns.map((block) => (
                                          <div
                                            key={block.id}
                                            className={`question-block span-${block.span}`}
                                          >
                                            <div className="question-block-head">
                                              <span>
                                                {block.type === 'text'
                                                  ? 'Tekst'
                                                  : block.type === 'image'
                                                    ? 'Obraz'
                                                    : 'Wideo'}
                                              </span>
                                              <div className="question-block-actions">
                                                <button
                                                  className="ghost small"
                                                  type="button"
                                                  onClick={() =>
                                                    startQuestionComponentEdit(
                                                      question.id,
                                                      block,
                                                    )
                                                  }
                                                >
                                                  Edytuj
                                                </button>
                                                <button
                                                  className="ghost small"
                                                  type="button"
                                                  onClick={() =>
                                                    handleRemoveQuestionComponent(
                                                      question.id,
                                                      block.id,
                                                    )
                                                  }
                                                >
                                                  Usuń
                                                </button>
                                              </div>
                                            </div>
                                            <div className="question-block-preview">
                                              {block.type === 'text' && (
                                                <MarkdownBlock markdown={block.markdown} />
                                              )}
                                              {block.type === 'image' && block.images[0] && (
                                                <ResolvedImage
                                                  src={block.images[0].src}
                                                  alt={block.images[0].alt}
                                                  className="question-image-thumb"
                                                />
                                              )}
                                              {block.type === 'video' && (
                                                <span>{block.title}</span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p>Brak materialow. Dodaj blok tresci.</p>
                                )}
                              </div>

                              {activeQuestionId === question.id && (
                                <div className="question-editor">
                                  <div className="question-editor-header">
                                    <strong>
                                      {editingQuestionComponentId
                                        ? 'Edytuj blok'
                                        : 'Dodaj blok'}
                                    </strong>
                                    <button
                                      className="ghost small"
                                      type="button"
                                      onClick={cancelQuestionComponentEdit}
                                    >
                                      Zamknij
                                    </button>
                                  </div>
                                  <label>
                                    Typ bloku
                                    <select
                                      value={questionComponentForm.type}
                                      onChange={(event) =>
                                        setQuestionComponentForm((current) => ({
                                          ...current,
                                          type: event.target
                                            .value as ContentComponent['type'],
                                        }))
                                      }
                                    >
                                      <option value="text">Tekst</option>
                                      <option value="image">Obraz</option>
                                      <option value="video">Wideo</option>
                                    </select>
                                  </label>
                                  <label>
                                    Szerokość (kolumny)
                                    <select
                                      value={questionComponentForm.span}
                                      onChange={(event) =>
                                        setQuestionComponentForm((current) => ({
                                          ...current,
                                          span: Number(
                                            event.target.value,
                                          ) as ColumnSpan,
                                        }))
                                      }
                                    >
                                      <option value={1}>1 kolumna</option>
                                      <option value={2}>2 kolumny</option>
                                      <option value={4}>4 kolumny</option>
                                    </select>
                                  </label>
                                  {questionComponentForm.type === 'text' && (
                                    <label>
                                      Tresc (Markdown)
                                      <textarea
                                        rows={5}
                                        value={questionComponentForm.markdown}
                                        onChange={(event) =>
                                          setQuestionComponentForm((current) => ({
                                            ...current,
                                            markdown: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>
                                  )}
                                  {questionComponentForm.type === 'image' && (
                                    <>
                                      <label>
                                        Linki do obrazow (src | opis | podpis)
                                        <textarea
                                          rows={3}
                                          value={questionComponentForm.imagesText}
                                          onChange={(event) =>
                                            setQuestionComponentForm((current) => ({
                                              ...current,
                                              imagesText: event.target.value,
                                            }))
                                          }
                                        />
                                      </label>
                                      <div className="asset-box">
                                        <div className="asset-header">
                                          <span>Obrazy z dysku</span>
                                          <button
                                            className="ghost small"
                                            type="button"
                                            onClick={handlePickQuestionImageAssets}
                                          >
                                            Dodaj obrazy
                                          </button>
                                        </div>
                                        {questionComponentForm.imageAssets.length ? (
                                          <div className="asset-list">
                                            {questionComponentForm.imageAssets.map((file) => (
                                              <div className="asset-item" key={file.id}>
                                                <div>
                                                  <strong>{file.name}</strong>
                                                  {file.size && (
                                                    <span>
                                                      {formatFileSize(file.size)}
                                                    </span>
                                                  )}
                                                </div>
                                                <button
                                                  className="ghost small"
                                                  type="button"
                                                  onClick={() =>
                                                    handleRemoveQuestionImageAsset(file.id)
                                                  }
                                                >
                                                  Usuń
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p>Brak obrazow.</p>
                                        )}
                                        {libraryImages.length ? (
                                          <div className="asset-library">
                                            <p className="asset-library-title">
                                              Biblioteka obrazów
                                            </p>
                                            <div className="asset-library-list">
                                              {libraryImages.map((item) => {
                                                const selected =
                                                  questionComponentForm.imageAssets.some(
                                                    (file) => file.id === item.id,
                                                  )
                                                return (
                                                  <div
                                                    className="asset-library-item"
                                                    key={item.id}
                                                  >
                                                    <ResolvedImage
                                                      src={`asset:${item.id}`}
                                                      alt={item.name}
                                                      className="asset-library-thumb"
                                                    />
                                                    <div className="asset-library-meta">
                                                      <strong>{item.name}</strong>
                                                      <span>
                                                        {formatFileSize(item.size) ||
                                                          'obraz'}
                                                      </span>
                                                    </div>
                                                    <button
                                                      className="ghost small"
                                                      type="button"
                                                      onClick={() =>
                                                        addLibraryQuestionImage(item)
                                                      }
                                                      disabled={selected}
                                                    >
                                                      {selected ? 'Dodany' : 'Dodaj'}
                                                    </button>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </>
                                  )}
                                  {questionComponentForm.type === 'video' && (
                                    <>
                                      <label>
                                        Tytul wideo
                                        <input
                                          value={questionComponentForm.title}
                                          onChange={(event) =>
                                            setQuestionComponentForm((current) => ({
                                              ...current,
                                              title: event.target.value,
                                            }))
                                          }
                                        />
                                      </label>
                                      <label>
                                        Opis
                                        <textarea
                                          rows={2}
                                          value={questionComponentForm.description}
                                          onChange={(event) =>
                                            setQuestionComponentForm((current) => ({
                                              ...current,
                                              description: event.target.value,
                                            }))
                                          }
                                        />
                                      </label>
                                      <label>
                                        Embed URL
                                        <input
                                          value={questionComponentForm.embedUrl}
                                          onChange={(event) =>
                                            setQuestionComponentForm((current) => ({
                                              ...current,
                                              embedUrl: event.target.value,
                                            }))
                                          }
                                          placeholder="https://www.youtube.com/embed/..."
                                        />
                                      </label>
                                      <div className="asset-box">
                                        <div className="asset-header">
                                          <span>Wideo z dysku</span>
                                          <button
                                            className="ghost small"
                                            type="button"
                                            onClick={handlePickQuestionVideoAsset}
                                          >
                                            Dodaj wideo
                                          </button>
                                        </div>
                                        {questionComponentForm.videoAsset ? (
                                          <div className="asset-item">
                                            <div>
                                              <strong>
                                                {questionComponentForm.videoAsset.name}
                                              </strong>
                                              {questionComponentForm.videoAsset.size && (
                                                <span>
                                                  {formatFileSize(
                                                    questionComponentForm.videoAsset.size,
                                                  )}
                                                </span>
                                              )}
                                            </div>
                                            <button
                                              className="ghost small"
                                              type="button"
                                              onClick={handleRemoveQuestionVideoAsset}
                                            >
                                              Usuń
                                            </button>
                                          </div>
                                        ) : (
                                          <p>Brak wideo.</p>
                                        )}
                                        {libraryVideos.length ? (
                                          <div className="asset-library">
                                            <p className="asset-library-title">
                                              Biblioteka wideo
                                            </p>
                                            <div className="asset-library-list">
                                              {libraryVideos.map((item) => {
                                                const selected =
                                                  questionComponentForm.videoAsset?.id ===
                                                  item.id
                                                return (
                                                  <div
                                                    className="asset-library-item"
                                                    key={item.id}
                                                  >
                                                    <div className="asset-library-icon video">
                                                      WIDEO
                                                    </div>
                                                    <div className="asset-library-meta">
                                                      <strong>{item.name}</strong>
                                                      <span>
                                                        {formatFileSize(item.size) ||
                                                          'wideo'}
                                                      </span>
                                                    </div>
                                                    <button
                                                      className="ghost small"
                                                      type="button"
                                                      onClick={() =>
                                                        useLibraryQuestionVideo(item)
                                                      }
                                                      disabled={selected}
                                                    >
                                                      {selected ? 'Wybrane' : 'Użyj'}
                                                    </button>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </>
                                  )}
                                  <div className="question-editor-actions">
                                    <button
                                      className="ghost small"
                                      type="button"
                                      onClick={cancelQuestionComponentEdit}
                                    >
                                      Anuluj
                                    </button>
                                    <button
                                      className="primary"
                                      type="button"
                                      onClick={() => handleSaveQuestionComponent(question.id)}
                                    >
                                      Zapisz blok
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div className="question-options">
                                <label>
                                  Liczba odpowiedzi
                                  <select
                                    value={question.options.length}
                                    onChange={(event) =>
                                      handleQuestionOptionCountChange(
                                        question.id,
                                        Number(event.target.value),
                                      )
                                    }
                                  >
                                    <option value={2}>2</option>
                                    <option value={3}>3</option>
                                    <option value={4}>4</option>
                                    <option value={5}>5</option>
                                  </select>
                                </label>
                                <div className="option-list">
                                  {question.options.map((option, optionIndex) => (
                                    <div className="option-row" key={option.id}>
                                      <span className="option-label">
                                        {OPTION_LABELS[optionIndex] ?? '?'}
                                      </span>
                                      <input
                                        value={option.text}
                                        onChange={(event) =>
                                          updateTestQuestion(
                                            question.id,
                                            (current) => ({
                                              ...current,
                                              options: current.options.map((item) =>
                                                item.id === option.id
                                                  ? {
                                                      ...item,
                                                      text: event.target.value,
                                                    }
                                                  : item,
                                              ),
                                            }),
                                          )
                                        }
                                        placeholder="Odpowiedz"
                                      />
                                      <label className="option-correct">
                                        <input
                                          type="checkbox"
                                          checked={option.isCorrect}
                                          onChange={() =>
                                            handleQuestionOptionToggle(
                                              question.id,
                                              option.id,
                                            )
                                          }
                                        />
                                        Poprawna
                                      </label>
                                    </div>
                                  ))}
                                </div>
                                {!question.options.some((option) => option.isCorrect) && (
                                  <p className="warning">
                                    Ustaw przynajmniej jedna poprawna odpowiedz.
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>Brak pytan. Dodaj pierwsze pytanie.</p>
                      )}
                    </div>
                  </>
                )}

                <button className="primary" type="submit">
                  Zapisz komponent
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {activeTestComponent && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="test-modal">
            <div className="test-modal-header">
              <div>
                <h3>{activeTestComponent.title}</h3>
                <p>{activeTestComponent.questions.length} pytań</p>
              </div>
              <button className="ghost" type="button" onClick={handleCloseTest}>
                Zamknij
              </button>
            </div>
            {activeTestResult && !activeTestProgress ? (
              <div className="test-result">
                <div className="test-result-summary">
                  <h4>
                    Wynik: {activeTestResult.score}/{activeTestResult.total}
                  </h4>
                  <p>
                    Zakonczono:{' '}
                    {formatDateTime(new Date(activeTestResult.completedAt))}
                  </p>
                  <div className="test-result-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => setShowCorrectAnswers((value) => !value)}
                    >
                      {showCorrectAnswers
                        ? 'Ukryj poprawne odpowiedzi'
                        : 'Pokaz poprawne odpowiedzi'}
                    </button>
                    <button
                      className="primary"
                      type="button"
                      onClick={() => {
                        handleResetTest(activeTestComponent.id)
                        handleStartTest(activeTestComponent)
                      }}
                    >
                      Rozwiaz jeszcze raz
                    </button>
                  </div>
                </div>
                {testBadgePreview[activeTestComponent.id] && (
                  <div className="badge-preview">
                    <img
                      src={testBadgePreview[activeTestComponent.id]}
                      alt="Podglad odznaki testu"
                    />
                    <div>
                      <h4>Odznaka testu</h4>
                      <p>Możesz ją zapisać lokalnie.</p>
                    </div>
                  </div>
                )}
                {showCorrectAnswers && (
                  <div className="test-review">
                    {activeTestComponent.questions.map((question, index) => (
                      <div className="test-review-question" key={question.id}>
                        <strong>
                          Pytanie {index + 1}: {question.prompt}
                        </strong>
                        <ul>
                          {question.options
                            .filter((option) => option.isCorrect)
                            .map((option) => (
                              <li key={option.id}>{option.text}</li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="test-runner">
                {activeTestProgress ? (
                  (() => {
                    const questionId =
                      activeTestProgress.questionOrder[
                        activeTestProgress.currentIndex
                      ]
                    const question = activeTestComponent.questions.find(
                      (item) => item.id === questionId,
                    )
                    if (!question) {
                      return <p>Brak pytania do wyswietlenia.</p>
                    }
                    const orderedOptionIds =
                      activeTestProgress.optionOrder[question.id] ??
                      question.options.map((option) => option.id)
                    const orderedOptions = orderedOptionIds
                      .map((id) =>
                        question.options.find((option) => option.id === id),
                      )
                      .filter(isDefined)
                    const selected = new Set(
                      activeTestProgress.answers[question.id] ?? [],
                    )
                    return (
                      <>
                        <div className="test-progress">
                          Pytanie {activeTestProgress.currentIndex + 1} z{' '}
                          {activeTestProgress.questionOrder.length}
                        </div>
                        <div className="test-question">
                          <h4>{question.prompt}</h4>
                          {question.rows.length > 0 && (
                            <div className="question-grid">
                              {question.rows.map((row) => (
                                <div className="question-row" key={row.id}>
                                  {row.columns.map((block) => (
                                    <div
                                      key={block.id}
                                      className={`question-block span-${block.span}`}
                                    >
                                      {block.type === 'text' && (
                                        <MarkdownBlock markdown={block.markdown} />
                                      )}
                                      {block.type === 'image' && (
                                        <div className="image-grid">
                                          {block.images.map((image) => (
                                            <button
                                              key={image.src}
                                              className="image-tile"
                                              type="button"
                                              onClick={() =>
                                                setLightboxImage(image)
                                              }
                                            >
                                              <ResolvedImage
                                                src={image.src}
                                                alt={image.alt}
                                              />
                                              {image.caption && (
                                                <span>{image.caption}</span>
                                              )}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      {block.type === 'video' && (
                                        <div className="video-block">
                                          <div className="video-header">
                                            <h3>{block.title}</h3>
                                            {block.description && (
                                              <p>{block.description}</p>
                                            )}
                                          </div>
                                          {block.embedUrl ? (
                                            <iframe
                                              title={block.title}
                                              src={block.embedUrl}
                                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                              allowFullScreen
                                              loading="lazy"
                                            />
                                          ) : block.assetId ? (
                                            <ResolvedVideo
                                              src={`asset:${block.assetId}`}
                                              title={block.title}
                                            />
                                          ) : (
                                            <div className="video-placeholder">
                                              Wideo zostanie wstawione przez nauczyciela.
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="test-options">
                          {orderedOptions.map((option, optionIndex) => (
                            <label key={option.id} className="test-option">
                              <input
                                type="checkbox"
                                checked={selected.has(option.id)}
                                onChange={() =>
                                  handleTestAnswerToggle(
                                    activeTestComponent.id,
                                    question.id,
                                    option.id,
                                  )
                                }
                              />
                              <span className="option-label">
                                {OPTION_LABELS[optionIndex] ?? '?'}
                              </span>
                              <span>{option.text}</span>
                            </label>
                          ))}
                        </div>
                        <div className="test-navigation">
                          <button
                            className="ghost"
                            type="button"
                            onClick={() =>
                              handleTestNavigation(activeTestComponent.id, 'prev')
                            }
                            disabled={activeTestProgress.currentIndex === 0}
                          >
                            Poprzednie
                          </button>
                          {activeTestProgress.currentIndex <
                          activeTestProgress.questionOrder.length - 1 ? (
                            <button
                              className="primary"
                              type="button"
                              onClick={() =>
                                handleTestNavigation(activeTestComponent.id, 'next')
                              }
                            >
                              Następne
                            </button>
                          ) : (
                            <button
                              className="primary"
                              type="button"
                              onClick={() => handleFinishTest(activeTestComponent)}
                            >
                              Zakończ test
                            </button>
                          )}
                        </div>
                      </>
                    )
                  })()
                ) : (
                  <p>Nie znaleziono zapisanego postępu testu.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {lightboxImage && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImage(null)}
        >
          <div className="lightbox" onClick={(event) => event.stopPropagation()}>
            <ResolvedImage
              src={lightboxImage.src}
              alt={lightboxImage.alt}
            />
            {lightboxImage.caption && <p>{lightboxImage.caption}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
