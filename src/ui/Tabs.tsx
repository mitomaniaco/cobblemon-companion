import type {ComponentProps} from 'react';
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  TabPanels as AriaTabPanels,
  Tabs as AriaTabs,
  type Key,
  type TabsProps as AriaTabsProps,
} from 'react-aria-components';
import styles from './Tabs.module.css';

export interface TabsProps extends Omit<AriaTabsProps, 'className' | 'onSelectionChange' | 'selectedKey'> {
  selectedKey: Key;
  onSelectionChange(key: Key): void;
  className?: string;
}

export function Tabs({className, ...props}: TabsProps) {
  return <AriaTabs {...props} className={`${styles.root}${className ? ` ${className}` : ''}`} />;
}

type AriaTabListProps = ComponentProps<typeof AriaTabList>;
export type TabListProps = Omit<AriaTabListProps, 'className'> & {className?: string};

export function TabList({className, ...props}: TabListProps) {
  return <AriaTabList {...props} className={`${styles.tabList}${className ? ` ${className}` : ''}`} />;
}

type AriaTabProps = ComponentProps<typeof AriaTab>;
export type TabProps = Omit<AriaTabProps, 'className'> & {className?: string};

export function Tab({className, ...props}: TabProps) {
  return <AriaTab {...props} className={`${styles.tab}${className ? ` ${className}` : ''}`} />;
}

type AriaTabPanelsProps = ComponentProps<typeof AriaTabPanels>;
export type TabPanelsProps = Omit<AriaTabPanelsProps, 'className'> & {className?: string};

export function TabPanels({className, ...props}: TabPanelsProps) {
  return <AriaTabPanels {...props} className={`${styles.tabPanels}${className ? ` ${className}` : ''}`} />;
}

type AriaTabPanelProps = ComponentProps<typeof AriaTabPanel>;
export type TabPanelProps = Omit<AriaTabPanelProps, 'className'> & {className?: string};

export function TabPanel({className, ...props}: TabPanelProps) {
  return <AriaTabPanel {...props} className={`${styles.tabPanel}${className ? ` ${className}` : ''}`} />;
}
