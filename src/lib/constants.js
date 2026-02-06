// --- App Version ---
export const APP_VERSION = "2.8.2";

// --- Tree Version ---
export const TREE_VERSION = 2;

// --- Colors ---
export const COLORS = [
  { name: 'gray', label: 'Gray' },
  { name: 'red', label: 'Red' },
  { name: 'orange', label: 'Orange' },
  { name: 'amber', label: 'Amber' },
  { name: 'green', label: 'Green' },
  { name: 'teal', label: 'Teal' },
  { name: 'blue', label: 'Blue' },
  { name: 'indigo', label: 'Indigo' },
  { name: 'purple', label: 'Purple' },
  { name: 'pink', label: 'Pink' },
];

// --- Background Colors (Tailwind classes) ---
export const BG_COLORS = {
  gray: 'bg-gray-100 dark:bg-gray-700',
  red: 'bg-red-100 dark:bg-red-900',
  orange: 'bg-orange-100 dark:bg-orange-900',
  amber: 'bg-amber-100 dark:bg-amber-900',
  green: 'bg-green-100 dark:bg-green-900',
  teal: 'bg-teal-100 dark:bg-teal-900',
  blue: 'bg-blue-100 dark:bg-blue-900',
  indigo: 'bg-indigo-100 dark:bg-indigo-900',
  purple: 'bg-purple-100 dark:bg-purple-900',
  pink: 'bg-pink-100 dark:bg-pink-900',
};

// --- Slash Commands ---
export const SLASH_COMMANDS = [
  { cmd: 'h1', aliases: ['h1', 'header1', 'heading1'], label: 'Heading 1', desc: 'Large section heading', type: 'h1' },
  { cmd: 'h2', aliases: ['h2', 'header2', 'heading2'], label: 'Heading 2', desc: 'Medium section heading', type: 'h2' },
  { cmd: 'h3', aliases: ['h3', 'header3', 'heading3'], label: 'Heading 3', desc: 'Small section heading', type: 'h3' },
  { cmd: 'h4', aliases: ['h4', 'header4', 'heading4'], label: 'Heading 4', desc: 'Tiny section heading', type: 'h4' },
  { cmd: 'ul', aliases: ['ul', 'bullet', 'list'], label: 'Bullet List', desc: 'Unordered list', type: 'ul' },
  { cmd: 'ol', aliases: ['ol', 'numbered', 'ordered'], label: 'Numbered List', desc: 'Ordered list', type: 'ol' },
  { cmd: 'todo', aliases: ['todo', 'checkbox', 'task'], label: 'Todo List', desc: 'Checkbox list', type: 'todo' },
  { cmd: 'img', aliases: ['img', 'image', 'pic', 'picture'], label: 'Image', desc: 'Embed an image', type: 'image' },
  { cmd: 'vid', aliases: ['vid', 'video', 'youtube'], label: 'Video', desc: 'Embed YouTube video', type: 'video' },
  { cmd: 'link', aliases: ['link', 'url', 'bookmark'], label: 'Link', desc: 'Web bookmark', type: 'link' },
  { cmd: 'div', aliases: ['div', 'divider', 'hr', 'line'], label: 'Divider', desc: 'Horizontal line', type: 'divider' },
  { cmd: 'gdoc', aliases: ['gdoc', 'gdrive', 'google'], label: 'Google Drive File', desc: 'Embed Google Doc/Sheet/Slide', type: 'gdoc' },
  { cmd: 'map', aliases: ['map', 'location', 'gps'], label: 'Map', desc: 'Interactive map with markers', type: 'map' },
];

// --- Block Types ---
export const BLOCK_TYPES = [
  { type: 'text', label: 'Text' },
  ...SLASH_COMMANDS.map(c => ({ type: c.type, label: c.label })),
];

// --- Google Drive Icons ---
export const DRIVE_LOGO_URL = 'https://fonts.gstatic.com/s/i/productlogos/drive_2020q4/v8/web-64dp/logo_drive_2020q4_color_2x_web_64dp.png';

export const DRIVE_SERVICE_ICONS = [
  { type: 'pdf', name: 'PDF', url: 'https://drive-thirdparty.googleusercontent.com/128/type/application%2Fpdf' },
  { type: 'doc', name: 'Google Docs', url: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_document_x128.png' },
  { type: 'sheet', name: 'Google Sheets', url: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x128.png' },
  { type: 'slide', name: 'Google Slides', url: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_presentation_x128.png' },
  { type: 'vid', name: 'Google Vids', url: 'https://drive-thirdparty.googleusercontent.com/128/type/application%2Fvnd.google-apps.vid' },
  { type: 'form', name: 'Google Forms', url: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_2_form_x128.png' },
  { type: 'drawing', name: 'Google Drawings', url: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_drawing_x128.png' },
  { type: 'map', name: 'Google MyMaps', url: 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_map_x128.png' },
  { type: 'site', name: 'Google Sites', url: 'https://drive-thirdparty.googleusercontent.com/128/type/application%2Fvnd.google-apps.site' },
  { type: 'script', name: 'Apps Script', url: 'https://drive-thirdparty.googleusercontent.com/128/type/application%2Fvnd.google-apps.script' },
];

// --- Emojis ---
export const EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "👋", "🤚", "🖐", "✋", "🖖", "👌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🦷", "🦴", "👀", "👁", "👅", "👄", "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "👨‍🦰", "👨‍🦱", "👨‍🦳", "👨‍🦲", "👩", "👩‍🦰", "👩‍🦱", "👩‍🦳", "👩‍🦲", "👱‍♀️", "👱‍♂️", "🧓", "👴", "👵", "🙍", "🙍‍♂️", "🙍‍♀️", "🙎", "🙎‍♂️", "🙎‍♀️", "🙅", "🙅‍♂️", "🙅‍♀️", "🙆", "🙆‍♂️", "🙆‍♀️", "💁", "💁‍♂️", "💁‍♀️", "🙋", "🙋‍♂️", "🙋‍♀️", "🧏", "🧏‍♂️", "🧏‍♀️", "🙇", "🙇‍♂️", "🙇‍♀️", "🤦", "🤦‍♂️", "🤦‍♀️", "🤷", "🤷‍♂️", "🤷‍♀️", "🧑‍⚕️", "👨‍⚕️", "👩‍⚕️", "🧑‍🎓", "👨‍🎓", "👩‍🎓", "🧑‍🏫", "👨‍🏫", "👩‍🏫", "🧑‍⚖️", "👨‍⚖️", "👩‍⚖️", "🧑‍🌾", "👨‍🌾", "👩‍🌾", "🧑‍🍳", "👨‍🍳", "👩‍🍳", "🧑‍🔧", "👨‍🔧", "👩‍🔧", "🧑‍🏭", "👨‍🏭", "👩‍🏭", "🧑‍💼", "👨‍💼", "👩‍💼", "🧑‍🔬", "👨‍🔬", "👩‍🔬", "🧑‍💻", "👨‍💻", "👩‍💻", "🧑‍🎤", "👨‍🎤", "👩‍🎤", "🧑‍🎨", "👨‍🎨", "👩‍🎨", "🧑‍✈️", "👨‍✈️", "👩‍✈️", "🧑‍🚀", "👨‍🚀", "👩‍🚀", "🧑‍🚒", "👨‍🚒", "👩‍🚒", "👮", "👮‍♂️", "👮‍♀️", "🕵", "🕵‍♂️", "🕵‍♀️", "💂", "💂‍♂️", "💂‍♀️", "👷", "👷‍♂️", "👷‍♀️", "🤴", "👸", "👳", "👳‍♂️", "👳‍♀️", "👲", "🧕", "🤵", "🤵‍♂️", "🤵‍♀️", "👰", "👰‍♂️", "👰‍♀️", "🤰", "🤱", "👩‍🍼", "👨‍🍼", "🧑‍🍼", "👼", "🎅", "🤶", "🧑‍🎄", "🦸", "🦸‍♂️", "🦸‍♀️", "🦹", "🦹‍♂️", "🦹‍♀️", "🧙", "🧙‍♂️", "🧙‍♀️", "🧚", "🧚‍♂️", "🧚‍♀️", "🧛", "🧛‍♂️", "🧛‍♀️", "🧜", "🧜‍♂️", "🧜‍♀️", "🧝", "🧝‍♂️", "🧝‍♀️", "🧞", "🧞‍♂️", "🧞‍♀️", "🧟", "🧟‍♂️", "🧟‍♀️", "💆", "💆‍♂️", "💆‍♀️", "💇", "💇‍♂️", "💇‍♀️", "🚶", "🚶‍♂️", "🚶‍♀️", "🧍", "🧍‍♂️", "🧍‍♀️", "🧎", "🧎‍♂️", "🧎‍♀️", "🧑‍🦯", "👨‍🦯", "👩‍🦯", "🧑‍🦼", "👨‍🦼", "👩‍🦼", "🧑‍🦽", "👨‍🦽", "👩‍🦽", "🏃", "🏃‍♂️", "🏃‍♀️", "💃", "🕺", "🕴", "👯", "👯‍♂️", "👯‍♀️", "🧖", "🧖‍♂️", "🧖‍♀️", "🧗", "🧗‍♂️", "🧗‍♀️", "🤺", "🏇", "⛷", "🏂", "🏌", "🏌‍♂️", "🏌‍♀️", "🏄", "🏄‍♂️", "🏄‍♀️", "🚣", "🚣‍♂️", "🚣‍♀️", "🏊", "🏊‍♂️", "🏊‍♀️", "⛹", "⛹‍♂️", "⛹‍♀️", "🏋", "🏋‍♂️", "🏋‍♀️", "🚴", "🚴‍♂️", "🚴‍♀️", "🚵", "🚵‍♂️", "🚵‍♀️", "🤸", "🤸‍♂️", "🤸‍♀️", "🤼", "🤼‍♂️", "🤼‍♀️", "🤽", "🤽‍♂️", "🤽‍♀️", "🤾", "🤾‍♂️", "🤾‍♀️", "🤹", "🤹‍♂️", "🤹‍♀️", "🧘", "🧘‍♂️", "🧘‍♀️", "🛀", "🛌", "📄", "📁", "📂", "💼", "📝", "🗓", "📅", "📇", "📉", "📈", "📊", "📋", "📌", "📍", "📎", "📏", "📐", "✂️", "🗂", "🗃", "🗄", "🗑", "🔒", "🔓", "🔏", "🔐", "🔑", "🗝", "🔨", "🪓", "⛏", "🔧", "🔩", "🧱", "⚙️", "🗜", "⚖️", "🔗", "⛓", "🧰", "🧲", "🪜", "🩸", "💉", "💊", "🩹", "🩺", "🔭", "🔬", "🦠", "🧬", "🧪", "🧫", "🧹", "🧺", "🧻", "🚽", "🚰", "🚿", "🛁", "🧼", "🪥", "🪒", "🧽", "🪣", "🧴", "🪞", "🪟", "🛏", "🛋", "🪑", "🚪", "🛎", "🖼", "🧭", "🗺", "⛱", "🗿", "🛍", "🛒", "👓", "🕶", "🥽", "🥼", "🦺", "👔", "👕", "👖", "🧣", "🧤", "🧥", "🧦", "👗", "👘", "🥻", "🩱", "🩲", "🩳", "👙", "👚", "👛", "👜", "👝", "🎒", "🎒", "👞", "👟", "🥾", "🥿", "👠", "👡", "🩰", "👢", "👑", "👒", "🎩", "🎓", "🧢", "⛑", "🪖", "💄", "💍", "💎", "🔇", "🔈", "🔉", "🔊", "📢", "📣", "📯", "🔔", "🔕", "🎼", "🎵", "🎶", "🎙", "🎚", "🎛", "🎤", "🎧", "📻", "🎷", "🪗", "🎸", "🎹", "🎺", "🎻", "🪕", "🥁", "🥁", "📱", "📲", "☎️", "📞", "📟", "📠", "🔋", "🔌", "💻", "🖥", "🖨", "⌨️", "🖱", "🖲", "💽", "💾", "💿", "📀", "🧮", "🎥", "🎞", "📽", "🎬", "📺", "📷", "📸", "📹", "📼", "🔍", "🔎", "🕯", "💡", "🔦", "🏮", "🪔", "📔", "📕", "📖", "📗", "📘", "📙", "📚", "📓", "📒", "📃", "📜", "📄", "📰", "🗞", "📑", "🔖", "🏷", "💰", "🪙", "💴", "💵", "💶", "💷", "💸", "💳", "🧾", "✉️", "✉️", "📧", "📨", "📩", "📤", "📥", "📦", "📫", "📪", "📬", "📭", "📮", "🗳", "✏️", "✒️", "🖋", "🖊", "🖌", "🖍", "📝", "💼", "📁", "📂", "🗂", "📅", "📆", "🗒", "🗓", "📇", "📈", "📉", "📊", "📋", "📌", "📍", "📎", "🖇", "📏", "📐", "✂️", "🗃", "🗄", "🗑", "🔒", "🔓", "🔏", "🔐", "🔑", "🗝", "🔨", "🪓", "⛏", "🔧", "🔩", "🧱", "⚙️", "🗜", "⚖️", "🔗", "⛓", "🧰", "🧲", "🪜", "⚗️", "🔭", "🔬", "🕳", "🩹", "🩺", "💊", "💉", "🩸", "🧬", "🦠", "🧫", "🧪", "🌡", "🧹", "🪠", "🧺", "🧻", "🚽", "🚰", "🚿", "🛁", "🛀", "🧼", "🪥", "🪒", "🧽", "🪣", "🧴", "🛎", "🔑", "🗝", "🚪", "🪑", "🛋", "🛏", "🛌", "🧸", "🪆", "🖼", "🪞", "🪟", "🛍", "🛒", "🎁", "🎈", "🎏", "🎀", "🪄", "🪅", "🎊", "🎉", "🎎", "🏮", "🎐", "🧧", "✉️", "📩", "📨", "📧", "💌", "📥", "📤", "📦", "🏷", "🪧", "📪", "📫", "📬", "📭", "📮", "📯", "📜", "📃", "📄", "📑", "🧾", "📊", "📈", "📉", "🗒", "🗓", "📆", "📅", "🗑", "📇", "🗃", "🗳", "🗄", "📋", "📁", "📂", "🗂", "🗞", "📰", "📓", "📔", "📒", "📕", "📗", "📘", "📙", "📚", "📖", "🔖", "🔗", "📎", "🖇", "📐", "📏", "🧮", "📌", "📍", "✂️", "🖊", "🖋", "✒️", "🖌", "🖍", "📝", "✏️", "🔍", "🔎", "🔏", "🔐", "🔒", "🔓"];

// --- Mermaid/Code Page Constants ---
export const MERMAID_MIN_SCALE = 0.2;
export const MERMAID_MAX_SCALE = 5;
export const MERMAID_ZOOM_STEP = 0.25;

// --- Pyodide URL ---
export const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.2/full/pyodide.js';

// --- Default Settings ---
export const DEFAULT_SETTINGS = {
  theme: 'light', // 'light', 'dark', 'system'
  maxColumns: 3,
  condensedView: false,
};

// --- Default Table Schema ---
export const DEFAULT_SCHEMA = {
  columns: [
    { id: 'c1', name: 'Item Name', type: 'text', width: 200 },
    { id: 'c2', name: 'Status', type: 'select', width: 150, options: ['Idea', 'In Progress', 'Done'] },
    { id: 'c3', name: 'Qty', type: 'number', width: 100 },
    { id: 'c4', name: 'Ordered?', type: 'boolean', width: 80 }
  ]
};

// --- Default Table Rows ---
export const DEFAULT_ROWS = [
  { id: 'r1', c1: 'Example Item', c2: 'Idea', c3: 1, c4: false }
];

// --- Initial Data ---
export const INITIAL_DATA = {
  notebooks: [
    {
      id: 'nb1', name: 'My First Notebook', icon: '📓', activeTabId: 'tab1',
      tabs: [
        {
          id: 'tab1', name: 'General', icon: '📋', color: 'blue', activePageId: 'page1',
          pages: [
            {
              id: 'page1',
              name: 'Welcome',
              createdAt: Date.now(),
              icon: '👋',
              cover: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1200&q=80',
              rows: [
                {
                  id: 'row1', columns: [
                    {
                      id: 'col1', blocks: [
                        { id: 'blk1', type: 'h1', content: 'Welcome to your new Note App!' },
                        { id: 'blk2', type: 'text', content: 'Try <b>bolding</b> or <i>italicizing</i> this text using standard keyboard shortcuts.' },
                        { id: 'blk3', type: 'text', content: 'Type / to see available commands like /h1, /img, etc.' },
                        { id: 'blk4', type: 'text', content: 'Use the slash menu for images, videos, links, and more.' }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};
