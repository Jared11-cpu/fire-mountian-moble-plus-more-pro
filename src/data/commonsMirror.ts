import mirror from './commonsMirror.json';

const COMMONS_FILE = 'https://commons.wikimedia.org/wiki/Special:Redirect/file/';

// 景点照片原本直接外链维基图片库，国内访问慢且不稳定。已镜像到本站 public/photos/ 的图片优先用本地副本，
// 作者、授权、原始页面的署名（imageCredit）不变；没有镜像到的文件仍回退到原始 Commons 地址。
export function commonsImageUrl(fileName: string, width = 1280) {
  const local = (mirror as Record<string, string>)[fileName];
  if (local) return `${import.meta.env.BASE_URL}${local}`;
  return `${COMMONS_FILE}${encodeURIComponent(fileName)}?width=${width}`;
}
