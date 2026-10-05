import {itemIconPath} from './assets';

export interface ItemIconProps {
  itemDexId: string;
  className?: string;
}

export function ItemIcon({itemDexId, className}: ItemIconProps) {
  const path = itemIconPath(itemDexId);
  if (path === null) return null;
  return <img className={className} src={path} alt="" width={24} height={24} decoding="async" style={{imageRendering: 'pixelated'}} />;
}
