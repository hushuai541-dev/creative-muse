// --- Guide Templates ---

export const templates = [
  {
    id: 'competitor',
    name: '竞品分析',
    icon: '\u{1F3AF}',
    mode: 'associate',
    prompt: '请输入产品/品类名称，比如"智能手表"',
  },
  {
    id: 'persona',
    name: '用户画像',
    icon: '\u{1F464}',
    mode: 'associate',
    prompt: '请输入目标人群，比如"一线城市宝妈"',
  },
  {
    id: 'requirement',
    name: '需求拆解',
    icon: '\u{1F527}',
    mode: 'pain',
    prompt: '请输入产品/功能名，比如"在线协作文档"',
  },
  {
    id: 'swot',
    name: 'SWOT 分析',
    icon: '\u{1F4CA}',
    mode: 'associate',
    prompt: '请输入分析主题，比如"新能源车企出海"',
  },
  {
    id: 'scenario',
    name: '场景梳理',
    icon: '\u{1F3EC}',
    mode: 'scenario',
    prompt: '请输入产品名称，比如"香薰蜡烛"',
  },
  {
    id: 'brainstorm',
    name: '头脑风暴',
    icon: '\u{26A1}',
    mode: 'associate',
    prompt: '输入一个核心关键词开始自由发散',
  },
];

export function getTemplate(id) {
  return templates.find(t => t.id === id) || templates[0];
}
